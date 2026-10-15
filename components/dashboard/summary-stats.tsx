import { GitCommitHorizontal, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalysisResult, Severity } from '@/lib/types'
import { SEVERITY_STYLES } from './shared'

export function SummaryStats({ analysis }: { analysis: AnalysisResult }) {
  const { repo, stats, findings } = analysis
  const bySeverity = (s: Severity) => findings.filter((f) => f.severity === s).length
  const overall = findings.length
    ? Math.round(findings.slice(0, 5).reduce((n, f) => n + f.score, 0) / Math.min(5, findings.length))
    : 0

  return (
    <section aria-label="Analysis summary" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={repo.url}
          target="_blank"
          rel="noreferrer"
          className="text-lg font-semibold tracking-tight hover:underline"
        >
          {repo.owner}/{repo.name}
        </a>
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <GitCommitHorizontal className="size-3.5" aria-hidden="true" />
          {repo.branch}@{repo.commit.slice(0, 7)}
        </span>
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Star className="size-3.5" aria-hidden="true" />
          {repo.stars}
        </span>
        {repo.pythonRequires && (
          <span className="font-mono text-xs text-muted-foreground">python {repo.pythonRequires}</span>
        )}
        {repo.description && <p className="w-full text-sm text-muted-foreground">{repo.description}</p>}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
        <Stat label="Exposure index" value={overall} hint="avg of top 5 risk scores" accent="text-risk-high" />
        <div className="flex flex-col gap-2 bg-card p-4">
          <span className="text-xs text-muted-foreground">At-risk dependencies</span>
          <span className="font-mono text-2xl font-semibold tabular-nums">
            {findings.length}
            <span className="text-sm text-muted-foreground"> / {stats.declaredDependencies}</span>
          </span>
          <div className="flex gap-2 font-mono text-[11px]">
            {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
              <span key={s} className={SEVERITY_STYLES[s].text}>
                {bySeverity(s)}
                {s[0].toUpperCase()}
              </span>
            ))}
          </div>
        </div>
        <Stat label="Known advisories" value={stats.vulnerabilities} hint="OSV, pinned versions" accent="text-risk-critical" />
        <Stat label="Usage locations" value={stats.usageLocations} hint={`${stats.pythonFiles} Python files scanned`} />
        <Stat label="Tests discovered" value={analysis.tests.length} hint="pytest functions" />
      </div>
    </section>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: number; hint: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-2 bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-2xl font-semibold tabular-nums', accent)}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{hint}</span>
    </div>
  )
}
