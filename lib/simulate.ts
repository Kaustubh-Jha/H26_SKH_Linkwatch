import { RULES_BY_ID, type Impact } from './rules'
import type { AnalysisResult, DependencyFinding, Outcome, PythonVersion, SimConfig } from './types'

export interface SimCell {
  outcome: Outcome
  reasons: { source: string; text: string; outcome: Outcome }[]
}

export interface SimRow {
  id: string
  name: string
  file: string
  line: number | null
  kind: 'test' | 'check'
  baseline: SimCell
  candidate: SimCell
}

export type OutcomeCounts = Record<Outcome, number>

export interface SimResult {
  rows: SimRow[]
  baseline: OutcomeCounts
  candidate: OutcomeCounts
}

export const PYTHON_VERSIONS: PythonVersion[] = ['3.10', '3.11', '3.12', '3.13']

export const DEFAULT_SIM_CONFIG: SimConfig = {
  python: '3.12',
  installFrom: 'requirements',
  timeout: 10,
  applied: [],
}

const RANK: Record<Outcome, number> = { pass: 0, skip: 1, warn: 2, fail: 3 }

const CHECKS: Record<string, { name: string; file: string }> = {
  'check:install': { name: 'Dependency resolution (pip install)', file: 'requirements.txt' },
  'check:nose': { name: 'make test-nose', file: 'Makefile' },
}

function emptyCell(): SimCell {
  return { outcome: 'pass', reasons: [] }
}

function apply(cell: SimCell, impact: Impact, source: string) {
  cell.reasons.push({ source, text: impact.reason, outcome: impact.outcome })
  if (RANK[impact.outcome] > RANK[cell.outcome]) cell.outcome = impact.outcome
}

function countOutcomes(rows: SimRow[], key: 'baseline' | 'candidate'): OutcomeCounts {
  const counts: OutcomeCounts = { pass: 0, warn: 0, fail: 0, skip: 0 }
  for (const r of rows) counts[r[key].outcome]++
  return counts
}

export function simulate(
  analysis: AnalysisResult,
  config: SimConfig,
  findings: DependencyFinding[] = analysis.findings,
): SimResult {
  const rows = new Map<string, SimRow>()
  for (const t of analysis.tests) {
    rows.set(t.id, {
      id: t.id,
      name: t.name,
      file: t.file,
      line: t.line,
      kind: 'test',
      baseline: emptyCell(),
      candidate: emptyCell(),
    })
  }

  const resolveTargets = (target: string): SimRow[] => {
    if (target.startsWith('check:')) {
      if (!rows.has(target)) {
        const meta = CHECKS[target] ?? { name: target.slice(6), file: '' }
        rows.set(target, {
          id: target,
          name: meta.name,
          file: meta.file,
          line: null,
          kind: 'check',
          baseline: emptyCell(),
          candidate: emptyCell(),
        })
      }
      return [rows.get(target)!]
    }
    if (target.startsWith('file:')) {
      const file = target.slice(5)
      return [...rows.values()].filter((r) => r.kind === 'test' && r.file === file)
    }
    return [...rows.values()].filter((r) => r.kind === 'test' && r.name === target)
  }

  const ctxBase = { python: config.python, installFrom: config.installFrom, timeout: config.timeout }

  for (const f of findings) {
    const rule = f.ruleId ? RULES_BY_ID.get(f.ruleId) : undefined
    if (!rule?.impact) continue
    for (const impact of rule.impact({ ...ctxBase, applied: false })) {
      for (const row of resolveTargets(impact.target)) apply(row.baseline, impact, f.displayName)
    }
    for (const impact of rule.impact({ ...ctxBase, applied: config.applied.includes(f.id) })) {
      for (const row of resolveTargets(impact.target)) apply(row.candidate, impact, f.displayName)
    }
  }

  if (!rows.has('check:install')) resolveTargets('check:install')

  const ordered = [...rows.values()].sort((a, b) =>
    a.kind === b.kind ? a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) : a.kind === 'check' ? -1 : 1,
  )

  return { rows: ordered, baseline: countOutcomes(ordered, 'baseline'), candidate: countOutcomes(ordered, 'candidate') }
}

export function simulateFinding(analysis: AnalysisResult, finding: DependencyFinding, config: SimConfig) {
  const result = simulate(analysis, { ...config, applied: [finding.id] }, [finding])
  const affected = result.rows.filter((r) => r.baseline.reasons.length || r.candidate.reasons.length)
  return { ...result, affected }
}
