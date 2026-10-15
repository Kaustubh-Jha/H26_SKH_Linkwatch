export type Severity = 'critical' | 'high' | 'medium' | 'low'

export type IndicatorKind =
  | 'vulnerability'
  | 'eol'
  | 'deprecated'
  | 'unmaintained'
  | 'conflict'
  | 'private-api'
  | 'runtime'
  | 'outdated'
  | 'unpinned'
  | 'undeclared'
  | 'unused'
  | 'license'

export interface RiskIndicator {
  kind: IndicatorKind
  label: string
  detail: string
  refs?: { id: string; url: string; summary?: string }[]
}

export type UsageKind = 'import' | 'call' | 'manifest' | 'build'

export interface UsageLocation {
  file: string
  line: number
  snippet: string
  kind: UsageKind
}

export type DependencyScope = 'runtime' | 'dev' | 'build'

export interface DeclaredSpec {
  file: string
  line: number
  spec: string
  raw: string
  scope: DependencyScope
}

export interface MigrationStep {
  title: string
  detail: string
  file?: string
  before?: string
  after?: string
}

export type ReplacementKind = 'stdlib' | 'package' | 'upgrade' | 'remove' | 'declare'
export type Effort = 'trivial' | 'low' | 'medium' | 'high'

export interface Replacement {
  name: string
  version: string
  kind: ReplacementKind
  rationale: string
  effort: Effort
  alternatives?: { name: string; note: string }[]
}

export interface DependencyFinding {
  id: string
  name: string
  displayName: string
  ruleId: string | null
  declared: DeclaredSpec[]
  pinnedVersion: string | null
  latestVersion: string | null
  latestReleaseDate: string | null
  severity: Severity
  score: number
  summary: string
  indicators: RiskIndicator[]
  usages: UsageLocation[]
  replacement: Replacement
  steps: MigrationStep[]
  gaps: string[]
  limitations: string[]
}

export interface DiscoveredTest {
  id: string
  name: string
  file: string
  line: number
}

export interface RepoInfo {
  owner: string
  name: string
  url: string
  branch: string
  commit: string
  description: string | null
  stars: number
  language: string | null
  pythonRequires: string | null
}

export interface AnalysisResult {
  repo: RepoInfo
  analyzedAt: string
  findings: DependencyFinding[]
  tests: DiscoveredTest[]
  stats: {
    declaredDependencies: number
    filesScanned: number
    pythonFiles: number
    usageLocations: number
    vulnerabilities: number
  }
  sources: { osv: boolean; pypi: boolean }
  limitations: string[]
}

export type PythonVersion = '3.10' | '3.11' | '3.12' | '3.13'
export type InstallSource = 'requirements' | 'pyproject'
export type Outcome = 'pass' | 'warn' | 'fail' | 'skip'

export interface SimConfig {
  python: PythonVersion
  installFrom: InstallSource
  timeout: number | null
  applied: string[]
}
