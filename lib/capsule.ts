import { simulateFinding } from './simulate'
import type { AnalysisResult, DependencyFinding, Outcome, SimConfig, UsageKind } from './types'

export function blobUrl(analysis: AnalysisResult, file: string, line?: number | null) {
  return `${analysis.repo.url}/blob/${analysis.repo.commit}/${file}${line ? `#L${line}` : ''}`
}

export function buildCapsule(analysis: AnalysisResult, finding: DependencyFinding, config: SimConfig) {
  const sim = simulateFinding(analysis, finding, config)
  const byKind = finding.usages.reduce(
    (acc, u) => ({ ...acc, [u.kind]: (acc[u.kind] ?? 0) + 1 }),
    {} as Partial<Record<UsageKind, number>>,
  )

  const count = (key: 'baseline' | 'candidate') =>
    sim.affected.reduce(
      (acc, r) => ({ ...acc, [r[key].outcome]: acc[r[key].outcome] + 1 }),
      { pass: 0, warn: 0, fail: 0, skip: 0 } as Record<Outcome, number>,
    )

  const derivedGaps = sim.affected
    .filter((r) => r.candidate.outcome === 'fail' || r.candidate.outcome === 'warn')
    .flatMap((r) => r.candidate.reasons.map((reason) => `${r.name}: ${reason.text}`))

  const limitations = [...finding.limitations]
  if (sim.affected.filter((r) => r.kind === 'test').length === 0) {
    limitations.push('No discovered test exercises this dependency; migration correctness relies on manual verification.')
  }
  limitations.push(...analysis.limitations)

  return {
    schema: 'linkwatch.dependency-exit-capsule/v1',
    generatedAt: new Date().toISOString(),
    repository: {
      url: analysis.repo.url,
      branch: analysis.repo.branch,
      commit: analysis.repo.commit,
      pythonRequires: analysis.repo.pythonRequires,
    },
    dependency: {
      name: finding.name,
      displayName: finding.displayName,
      pinnedVersion: finding.pinnedVersion,
      latestVersion: finding.latestVersion,
      latestReleaseDate: finding.latestReleaseDate,
      declared: finding.declared.map((d) => ({ file: d.file, line: d.line, spec: d.spec || '(any)', scope: d.scope })),
    },
    risk: {
      severity: finding.severity,
      score: finding.score,
      summary: finding.summary,
      indicators: finding.indicators,
    },
    usage: {
      total: finding.usages.length,
      byKind,
      locations: finding.usages.map((u) => ({ ...u, url: blobUrl(analysis, u.file, u.line) })),
    },
    replacement: finding.replacement,
    migrationSteps: finding.steps,
    testResults: {
      mode: 'static-simulation',
      config: { python: config.python, installFrom: config.installFrom, timeoutSeconds: config.timeout },
      summary: { baseline: count('baseline'), candidate: count('candidate') },
      cases: sim.affected.map((r) => ({
        name: r.name,
        file: r.file,
        kind: r.kind,
        baseline: r.baseline.outcome,
        candidate: r.candidate.outcome,
        notes: [...r.baseline.reasons.map((x) => `baseline: ${x.text}`), ...r.candidate.reasons.map((x) => `candidate: ${x.text}`)],
      })),
    },
    compatibilityGaps: [...finding.gaps, ...derivedGaps],
    openLimitations: limitations,
  }
}

export type Capsule = ReturnType<typeof buildCapsule>

const code = (s: string) => '```\n' + s + '\n```'

export function capsuleToMarkdown(c: Capsule) {
  const lines: string[] = []
  const d = c.dependency
  lines.push(`# Dependency Exit Capsule — ${d.displayName}`, '')
  lines.push(`> ${c.risk.summary}`, '')
  lines.push(`- **Repository:** ${c.repository.url} @ \`${c.repository.commit.slice(0, 7)}\` (${c.repository.branch})`)
  lines.push(`- **Generated:** ${c.generatedAt}`)
  lines.push(`- **Severity:** ${c.risk.severity.toUpperCase()} · score ${c.risk.score}/100`, '')

  lines.push('## Dependency details', '')
  lines.push(`- Pinned: ${d.pinnedVersion ?? 'not pinned'} · Latest: ${d.latestVersion ?? 'unknown'}`)
  for (const decl of d.declared) lines.push(`- Declared \`${decl.spec}\` in \`${decl.file}:${decl.line}\` (${decl.scope})`)
  lines.push('')

  lines.push('## Risk indicators', '')
  for (const i of c.risk.indicators) {
    lines.push(`- **${i.label}** (${i.kind}) — ${i.detail}`)
    for (const r of i.refs ?? []) lines.push(`  - [${r.id}](${r.url})${r.summary ? `: ${r.summary}` : ''}`)
  }
  lines.push('')

  lines.push(`## Usage locations (${c.usage.total})`, '')
  for (const u of c.usage.locations) lines.push(`- [\`${u.file}:${u.line}\`](${u.url}) · ${u.kind} · \`${u.snippet}\``)
  lines.push('')

  const r = c.replacement
  lines.push('## Replacement', '')
  lines.push(`**${r.name}** \`${r.version}\` · ${r.kind} · effort: ${r.effort}`, '', r.rationale, '')
  for (const a of r.alternatives ?? []) lines.push(`- Alternative: **${a.name}** — ${a.note}`)
  lines.push('')

  lines.push('## Migration steps', '')
  c.migrationSteps.forEach((s, idx) => {
    lines.push(`### ${idx + 1}. ${s.title}${s.file ? ` (\`${s.file}\`)` : ''}`, '', s.detail, '')
    if (s.before) lines.push('Before:', code(s.before), '')
    if (s.after) lines.push('After:', code(s.after), '')
  })

  const t = c.testResults
  lines.push('## Test results (static simulation)', '')
  lines.push(`Python ${t.config.python} · install from ${t.config.installFrom} · timeout ${t.config.timeoutSeconds ?? 'none'}s`, '')
  if (t.cases.length === 0) lines.push('_No tests or checks are affected by this dependency._')
  else {
    lines.push('| Case | File | Baseline | Candidate |', '|---|---|---|---|')
    for (const tc of t.cases) lines.push(`| ${tc.name} | ${tc.file} | ${tc.baseline} | ${tc.candidate} |`)
  }
  lines.push('')

  lines.push('## Compatibility gaps', '')
  if (c.compatibilityGaps.length === 0) lines.push('_None identified._')
  for (const g of c.compatibilityGaps) lines.push(`- ${g}`)
  lines.push('')

  lines.push('## Open limitations', '')
  for (const l of c.openLimitations) lines.push(`- ${l}`)
  lines.push('')
  return lines.join('\n')
}
