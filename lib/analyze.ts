import { RULES, RULES_BY_PACKAGE, normalizePackage, type Rule, type UsagePattern } from './rules'
import type {
  AnalysisResult,
  DeclaredSpec,
  DependencyFinding,
  DependencyScope,
  DiscoveredTest,
  RiskIndicator,
  Severity,
  UsageLocation,
} from './types'

export class AnalysisError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

const UA = { 'User-Agent': 'linkwatch-dependency-resilience' }
const MAX_PY_FILES = 250
const MAX_FILE_BYTES = 300_000

export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const cleaned = input.replace(/\s+/g, '').replace(/\.git$/, '').replace(/\/+$/, '')
  const fromUrl = cleaned.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i)
  const short = cleaned.match(/^([\w.-]+)\/([\w.-]+)$/)
  const m = fromUrl ?? short
  return m ? { owner: m[1], name: m[2] } : null
}

async function github<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', ...UA },
    next: { revalidate: 600 },
  })
  if (res.status === 404) throw new AnalysisError('Repository not found or not public.', 404)
  if (res.status === 403 || res.status === 429)
    throw new AnalysisError('GitHub API rate limit reached. Try again in a few minutes.', 429)
  if (!res.ok) throw new AnalysisError(`GitHub API error (${res.status}).`, 502)
  return res.json() as Promise<T>
}

async function rawFile(owner: string, name: string, ref: string, path: string) {
  const res = await fetch(
    `https://raw.githubusercontent.com/${owner}/${name}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`,
    { headers: UA, next: { revalidate: 600 } },
  )
  return res.ok ? res.text() : null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

const REQ_LINE = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*([^;#]*)/

function parseRequirement(raw: string) {
  const m = raw.trim().match(REQ_LINE)
  if (!m) return null
  return { name: normalizePackage(m[1]), spec: m[3].trim().replace(/\s+/g, '') }
}

function parseRequirementsTxt(file: string, text: string): (DeclaredSpec & { name: string })[] {
  const scope: DependencyScope = /dev|test/i.test(file) ? 'dev' : 'runtime'
  return text.split('\n').flatMap((line, idx) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) return []
    const req = parseRequirement(trimmed)
    return req ? [{ ...req, file, line: idx + 1, raw: trimmed, scope }] : []
  })
}

function parsePyproject(file: string, text: string) {
  const out: (DeclaredSpec & { name: string })[] = []
  let section = ''
  let arrayScope: DependencyScope | null = null
  let pythonRequires: string | null = null

  text.split('\n').forEach((line, idx) => {
    const trimmed = line.trim()
    const header = trimmed.match(/^\[([^\]]+)\]$/)
    if (header) {
      section = header[1]
      arrayScope = null
      return
    }
    const rp = trimmed.match(/^requires-python\s*=\s*["']([^"']+)["']/)
    if (rp && section === 'project') pythonRequires = rp[1]

    const opener = trimmed.match(/^([\w-]+)\s*=\s*\[(.*)$/)
    if (opener) {
      const key = opener[1]
      if (section === 'project' && key === 'dependencies') arrayScope = 'runtime'
      else if (section === 'build-system' && key === 'requires') arrayScope = 'build'
      else if (section === 'project.optional-dependencies') arrayScope = 'dev'
      else return
    }
    if (!arrayScope) return
    for (const m of trimmed.matchAll(/["']([^"']+)["']/g)) {
      const req = parseRequirement(m[1])
      if (req) out.push({ ...req, file, line: idx + 1, raw: m[1], scope: arrayScope })
    }
    if (trimmed.includes(']')) arrayScope = null
  })
  return { declared: out, pythonRequires }
}

const MODULE_ALIASES: Record<string, string> = {
  'python-dateutil': 'dateutil',
  pyyaml: 'yaml',
  beautifulsoup4: 'bs4',
  pillow: 'PIL',
  'scikit-learn': 'sklearn',
  'charset-normalizer': 'charset_normalizer',
}

function genericImportPattern(pkg: string): UsagePattern {
  const mod = MODULE_ALIASES[pkg] ?? pkg.replace(/-/g, '_')
  return {
    re: new RegExp(`^\\s*(import\\s+${mod}\\b|from\\s+${mod}(\\.[\\w.]+)?\\s+import\\b)`),
    kind: 'import',
  }
}

function scanPython(files: { path: string; text: string }[], patterns: UsagePattern[]) {
  const usages: UsageLocation[] = []
  const imports = patterns.filter((p) => p.kind === 'import')
  const calls = patterns.filter((p) => p.kind === 'call')
  for (const { path, text } of files) {
    const lines = text.split('\n')
    const hasImport = lines.some((l) => imports.some((p) => p.re.test(l)))
    if (!hasImport) continue
    lines.forEach((line, idx) => {
      const kind = imports.some((p) => p.re.test(line))
        ? 'import'
        : calls.some((p) => p.re.test(line))
          ? 'call'
          : null
      if (kind) usages.push({ file: path, line: idx + 1, snippet: line.trim().slice(0, 160), kind })
    })
  }
  return usages
}

function scanBuild(files: { path: string; text: string }[], patterns: RegExp[]) {
  const usages: UsageLocation[] = []
  for (const { path, text } of files) {
    text.split('\n').forEach((line, idx) => {
      if (patterns.some((p) => p.test(line)))
        usages.push({ file: path, line: idx + 1, snippet: line.trim().slice(0, 160), kind: 'build' })
    })
  }
  return usages
}

function discoverTests(files: { path: string; text: string }[]): DiscoveredTest[] {
  return files
    .filter((f) => /(^|\/)tests?\//.test(f.path) || /(^|\/)test_[^/]*\.py$/.test(f.path))
    .flatMap((f) =>
      f.text.split('\n').flatMap((line, idx) => {
        const m = line.match(/^\s*(?:async\s+)?def\s+(test_\w+)\s*\(/)
        return m ? [{ id: `${f.path}::${m[1]}`, name: m[1], file: f.path, line: idx + 1 }] : []
      }),
    )
}

interface PypiInfo {
  latest: string | null
  released: string | null
}

async function fetchPypi(pkg: string): Promise<PypiInfo | null> {
  try {
    const res = await fetch(`https://pypi.org/pypi/${pkg}/json`, {
      headers: UA,
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      info: { version: string }
      urls: { upload_time_iso_8601?: string }[]
    }
    return { latest: data.info.version, released: data.urls[0]?.upload_time_iso_8601 ?? null }
  } catch {
    return null
  }
}

interface OsvVuln {
  id: string
  summary?: string
  aliases?: string[]
}

async function fetchOsv(pinned: { name: string; version: string }[]) {
  if (pinned.length === 0) return new Map<string, RiskIndicator['refs']>()
  const res = await fetch('https://api.osv.dev/v1/querybatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...UA },
    body: JSON.stringify({
      queries: pinned.map((p) => ({ package: { name: p.name, ecosystem: 'PyPI' }, version: p.version })),
    }),
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`OSV ${res.status}`)
  const data = (await res.json()) as { results: { vulns?: { id: string }[] }[] }

  const ids = [...new Set(data.results.flatMap((r) => (r.vulns ?? []).map((v) => v.id)))].slice(0, 60)
  const details = await mapLimit(ids, 10, async (id) => {
    try {
      const r = await fetch(`https://api.osv.dev/v1/vulns/${id}`, {
        headers: UA,
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 86400 },
      })
      return r.ok ? ((await r.json()) as OsvVuln) : { id }
    } catch {
      return { id } as OsvVuln
    }
  })
  const byId = new Map(details.map((d) => [d.id, d]))

  const result = new Map<string, RiskIndicator['refs']>()
  pinned.forEach((p, i) => {
    const seen = new Set<string>()
    const refs: NonNullable<RiskIndicator['refs']> = []
    for (const v of data.results[i]?.vulns ?? []) {
      const d = byId.get(v.id) ?? { id: v.id }
      const cve = [v.id, ...(d.aliases ?? [])].find((a) => a.startsWith('CVE-'))
      const key = cve ?? v.id
      if (seen.has(key)) continue
      seen.add(key)
      refs.push({ id: key, url: `https://osv.dev/vulnerability/${v.id}`, summary: d.summary })
    }
    if (refs.length) result.set(`${p.name}@${p.version}`, refs)
  })
  return result
}

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 }

const majorOf = (v: string | null) => {
  const n = v ? parseInt(v.split('.')[0], 10) : NaN
  return Number.isNaN(n) ? null : n
}

export async function analyzeRepo(input: string): Promise<AnalysisResult> {
  const parsed = parseRepoInput(input)
  if (!parsed) throw new AnalysisError('Enter a GitHub repository URL such as https://github.com/rishrek/LinkWatch.')

  const repo = await github<{
    full_name: string
    name: string
    owner: { login: string }
    html_url: string
    default_branch: string
    description: string | null
    stargazers_count: number
    language: string | null
  }>(`/repos/${parsed.owner}/${parsed.name}`)

  const owner = repo.owner.login
  const name = repo.name
  const branch = await github<{ commit: { sha: string } }>(
    `/repos/${owner}/${name}/branches/${encodeURIComponent(repo.default_branch)}`,
  )
  const commit = branch.commit.sha
  const tree = await github<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
    `/repos/${owner}/${name}/git/trees/${commit}?recursive=1`,
  )

  const blobs = tree.tree.filter((t) => t.type === 'blob' && (t.size ?? 0) <= MAX_FILE_BYTES)
  const ignored = /(^|\/)(\.venv|venv|site-packages|node_modules|build|dist)\//
  const manifestPaths = blobs
    .map((b) => b.path)
    .filter((p) => !ignored.test(p) && (/(^|\/)requirements[^/]*\.txt$/.test(p) || /(^|\/)pyproject\.toml$/.test(p)))
  const buildPaths = blobs
    .map((b) => b.path)
    .filter(
      (p) =>
        !ignored.test(p) &&
        (/(^|\/)(Makefile|Dockerfile|tox\.ini|setup\.cfg|noxfile\.py)$/.test(p) || /^\.github\/workflows\/.+\.ya?ml$/.test(p)),
    )
  const allPy = blobs.map((b) => b.path).filter((p) => p.endsWith('.py') && !ignored.test(p))
  const pyPaths = allPy.slice(0, MAX_PY_FILES)

  if (manifestPaths.length === 0 && pyPaths.length === 0) {
    throw new AnalysisError('No Python manifests or sources found. This analyzer currently supports Python repositories.', 422)
  }

  const fetchAll = (paths: string[]) =>
    mapLimit(paths, 16, async (path) => ({ path, text: (await rawFile(owner, name, commit, path)) ?? '' }))
  const [manifestFiles, buildFiles, pyFiles] = await Promise.all([
    fetchAll(manifestPaths),
    fetchAll(buildPaths),
    fetchAll(pyPaths),
  ])

  const declared: (DeclaredSpec & { name: string })[] = []
  let pythonRequires: string | null = null
  for (const f of manifestFiles) {
    if (f.path.endsWith('pyproject.toml')) {
      const r = parsePyproject(f.path, f.text)
      declared.push(...r.declared)
      pythonRequires ??= r.pythonRequires
    } else {
      declared.push(...parseRequirementsTxt(f.path, f.text))
    }
  }

  const declaredByPkg = new Map<string, DeclaredSpec[]>()
  for (const { name: pkg, ...spec } of declared) {
    declaredByPkg.set(pkg, [...(declaredByPkg.get(pkg) ?? []), spec])
  }

  const pinnedOf = (specs: DeclaredSpec[]) => {
    const pin = specs.find((s) => s.scope !== 'build' && s.spec.startsWith('=='))
    return pin ? pin.spec.slice(2) : null
  }

  const candidatePkgs = [...declaredByPkg.keys()]
  const pinned = candidatePkgs.flatMap((pkg) => {
    const v = pinnedOf(declaredByPkg.get(pkg)!)
    return v ? [{ name: pkg, version: v }] : []
  })

  const limitations: string[] = [
    'Static analysis only: no code was executed. Simulator outcomes are rule-based predictions derived from known breaking changes.',
    'Only requirements*.txt and pyproject.toml are parsed; setup.py, setup.cfg, Pipfile and lock files are not.',
    'Transitive dependencies are not resolved; only declared and directly imported packages are assessed.',
  ]
  if (allPy.length > MAX_PY_FILES) limitations.push(`Scanned the first ${MAX_PY_FILES} of ${allPy.length} Python files.`)
  if (tree.truncated) limitations.push('GitHub truncated the repository tree; some files were not scanned.')

  const [osvResult, pypiResults] = await Promise.all([
    fetchOsv(pinned).then(
      (m) => ({ ok: true as const, map: m }),
      () => ({ ok: false as const, map: new Map<string, RiskIndicator['refs']>() }),
    ),
    mapLimit(candidatePkgs, 8, fetchPypi),
  ])
  const pypi = new Map(candidatePkgs.map((p, i) => [p, pypiResults[i]]))
  const pypiOk = pypiResults.some(Boolean)
  if (!osvResult.ok) limitations.push('OSV vulnerability feed was unreachable; advisories may be missing.')
  if (!pypiOk && candidatePkgs.length) limitations.push('PyPI metadata was unreachable; release freshness was not assessed.')

  const manifestUsages = (pkg: string): UsageLocation[] =>
    (declaredByPkg.get(pkg) ?? []).map((d) => ({ file: d.file, line: d.line, snippet: d.raw, kind: 'manifest' }))

  const findings: DependencyFinding[] = []
  const handled = new Set<string>()

  const enrich = (
    base: Omit<DependencyFinding, 'pinnedVersion' | 'latestVersion' | 'latestReleaseDate'>,
    pkg: string,
    hasLifecycleIndicator: boolean,
  ): DependencyFinding => {
    const specs = declaredByPkg.get(pkg) ?? []
    const pinnedVersion = pinnedOf(specs)
    const meta = pypi.get(pkg) ?? null
    const indicators = [...base.indicators]
    let score = base.score
    let severity = base.severity

    const nonBuild = specs.filter((s) => s.scope !== 'build')
    const distinct = [...new Set(nonBuild.map((s) => s.spec || '(any)'))]
    if (distinct.length > 1) {
      indicators.unshift({
        kind: 'conflict',
        label: 'Conflicting version constraints',
        detail: nonBuild.map((s) => `${s.spec || '(any)'} in ${s.file}:${s.line}`).join('  vs  '),
      })
      score += 8
    }

    const vulns = pinnedVersion ? osvResult.map.get(`${pkg}@${pinnedVersion}`) : undefined
    if (vulns?.length) {
      indicators.unshift({
        kind: 'vulnerability',
        label: `${vulns.length} known ${vulns.length === 1 ? 'advisory' : 'advisories'} for ${pinnedVersion}`,
        detail: 'Reported by the OSV database for the exact pinned version.',
        refs: vulns,
      })
      score += Math.min(14, vulns.length * 3)
      if (SEVERITY_RANK[severity] < SEVERITY_RANK.high) severity = 'high'
    }

    const pinMajor = majorOf(pinnedVersion)
    const latestMajor = majorOf(meta?.latest ?? null)
    if (pinMajor !== null && latestMajor !== null && latestMajor > pinMajor) {
      const diff = latestMajor - pinMajor
      indicators.push({
        kind: 'outdated',
        label: `${diff} major ${diff === 1 ? 'version' : 'versions'} behind`,
        detail: `Pinned ${pinnedVersion}; latest on PyPI is ${meta!.latest}.`,
      })
      score += Math.min(6, diff * 2)
    }

    if (!hasLifecycleIndicator && meta?.released) {
      const years = (Date.now() - new Date(meta.released).getTime()) / (365.25 * 864e5)
      if (years >= 2) {
        indicators.push({
          kind: 'unmaintained',
          label: `No release in ${Math.floor(years)} years`,
          detail: `Latest version ${meta.latest} was published ${meta.released.slice(0, 10)}.`,
        })
        score += 6
      }
    }

    const runtimeSpecs = specs.filter((s) => s.scope === 'runtime')
    if (runtimeSpecs.length && runtimeSpecs.every((s) => !s.spec)) {
      indicators.push({ kind: 'unpinned', label: 'Unpinned', detail: 'Any version can be installed, including future breaking majors.' })
    } else if (runtimeSpecs.length && runtimeSpecs.every((s) => s.spec.startsWith('>=') && !s.spec.includes('<'))) {
      indicators.push({ kind: 'unpinned', label: 'Lower bound only', detail: `${runtimeSpecs[0].spec} has no upper bound on the next major.` })
    }

    const codeUsages = base.usages.filter((u) => u.kind === 'import' || u.kind === 'call').length
    score += Math.min(6, codeUsages)

    return {
      ...base,
      indicators,
      severity,
      score: Math.min(99, score),
      pinnedVersion,
      latestVersion: meta?.latest ?? null,
      latestReleaseDate: meta?.released ?? null,
    }
  }

  const ruleUsages = (rule: Rule, pkg: string) => [
    ...scanPython(pyFiles, rule.patterns),
    ...(rule.buildPatterns ? scanBuild(buildFiles, rule.buildPatterns) : []),
    ...manifestUsages(pkg),
  ]

  for (const rule of RULES) {
    const pkg = normalizePackage(rule.packages[0])
    const usages = ruleUsages(rule, pkg)
    const isDeclared = declaredByPkg.has(pkg)
    const codeUsages = usages.filter((u) => u.kind === 'import' || u.kind === 'call')
    if (!isDeclared && codeUsages.length === 0) continue
    if (rule.onlyIfUndeclared && isDeclared) continue

    const indicators = [...rule.indicators]
    if (rule.onlyIfUndeclared) {
      indicators.unshift({
        kind: 'undeclared',
        label: 'Imported but not declared',
        detail: `${codeUsages[0].file} imports ${rule.displayName} directly, but no manifest declares it — it is only present transitively.`,
      })
    }
    if (rule.flagIfUnused && isDeclared && codeUsages.length === 0) {
      indicators.unshift({
        kind: 'unused',
        label: 'Declared but never imported',
        detail: `No import of ${rule.displayName} was found in ${pyFiles.length} scanned Python files.`,
      })
    }

    handled.add(pkg)
    findings.push(
      enrich(
        {
          id: rule.id,
          name: pkg,
          displayName: rule.displayName,
          ruleId: rule.id,
          declared: declaredByPkg.get(pkg) ?? [],
          severity: rule.severity,
          score: rule.baseScore,
          summary: rule.summary,
          indicators,
          usages,
          replacement: rule.replacement,
          steps: rule.steps,
          gaps: rule.gaps,
          limitations: rule.limitations,
        },
        pkg,
        indicators.some((i) => i.kind === 'unmaintained' || i.kind === 'eol'),
      ),
    )
  }

  for (const [pkg, specs] of declaredByPkg) {
    if (handled.has(pkg) || RULES_BY_PACKAGE.has(pkg)) continue
    if (specs.every((s) => s.scope === 'build')) continue
    const usages = [...scanPython(pyFiles, [genericImportPattern(pkg)]), ...manifestUsages(pkg)]
    const meta = pypi.get(pkg)
    const finding = enrich(
      {
        id: `pkg-${pkg}`,
        name: pkg,
        displayName: pkg,
        ruleId: null,
        declared: specs,
        severity: 'low',
        score: 18,
        summary: 'Flagged by generic hygiene checks (pinning, freshness, advisories).',
        indicators: [],
        usages,
        replacement: {
          name: pkg,
          version: meta?.latest ? `~=${meta.latest.split('.').slice(0, 2).join('.')}` : 'compatible range',
          kind: 'upgrade',
          effort: 'trivial',
          rationale: 'Keep the package, but constrain it to a compatible release range so future majors cannot break installs.',
        },
        steps: [
          {
            title: 'Constrain to a compatible release range',
            file: specs[0].file,
            detail: 'Use the same constraint in every manifest that declares this package.',
            before: specs[0].raw,
            after: meta?.latest ? `${pkg}~=${meta.latest.split('.').slice(0, 2).join('.')}` : `${pkg}>=X.Y,<X+1`,
          },
        ],
        gaps: [],
        limitations: ['No package-specific breaking-change knowledge is available; only generic checks were applied.'],
      },
      pkg,
      false,
    )
    if (finding.indicators.length === 0) continue
    if (finding.indicators.some((i) => i.kind === 'vulnerability' || i.kind === 'unmaintained' || i.kind === 'outdated')) {
      finding.severity = finding.indicators.some((i) => i.kind === 'vulnerability') ? 'high' : 'medium'
      finding.score = Math.max(finding.score, finding.severity === 'high' ? 62 : 40)
    }
    findings.push(finding)
  }

  findings.sort((a, b) => b.score - a.score)

  const vulnerabilities = findings.reduce(
    (n, f) => n + (f.indicators.find((i) => i.kind === 'vulnerability')?.refs?.length ?? 0),
    0,
  )

  return {
    repo: {
      owner,
      name,
      url: repo.html_url,
      branch: repo.default_branch,
      commit,
      description: repo.description,
      stars: repo.stargazers_count,
      language: repo.language,
      pythonRequires,
    },
    analyzedAt: new Date().toISOString(),
    findings,
    tests: discoverTests(pyFiles),
    stats: {
      declaredDependencies: declaredByPkg.size,
      filesScanned: manifestFiles.length + buildFiles.length + pyFiles.length,
      pythonFiles: pyFiles.length,
      usageLocations: findings.reduce((n, f) => n + f.usages.length, 0),
      vulnerabilities,
    },
    sources: { osv: osvResult.ok, pypi: pypiOk },
    limitations,
  }
}
