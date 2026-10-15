'use client'

import { useMemo, useState } from 'react'
import { ArrowUpRight, FileCode2, PackageOpen, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { blobUrl } from '@/lib/capsule'
import type { AnalysisResult, DependencyFinding, Severity, UsageKind } from '@/lib/types'
import { FindingList } from './finding-list'
import { INDICATOR_ICONS, SEVERITY_STYLES, SectionLabel, SeverityBadge } from './shared'

const FILTERS: (Severity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low']

export function RiskPanel({
  analysis,
  selected,
  onSelect,
  onOpenMigration,
  onOpenCapsule,
}: {
  analysis: AnalysisResult
  selected: DependencyFinding | undefined
  onSelect: (id: string) => void
  onOpenMigration: () => void
  onOpenCapsule: () => void
}) {
  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const visible = useMemo(
    () => analysis.findings.filter((f) => filter === 'all' || f.severity === filter),
    [analysis.findings, filter],
  )
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: analysis.findings.length }
    for (const f of analysis.findings) c[f.severity] = (c[f.severity] ?? 0) + 1
    return c
  }, [analysis.findings])

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'h-7 rounded-md px-2 text-xs capitalize transition-colors',
                filter === f ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f} <span className="font-mono tabular-nums opacity-60">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <FindingList
          label="At-risk dependencies"
          findings={visible}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
        />
      </aside>

      {selected ? (
        <FindingDetail
          analysis={analysis}
          finding={selected}
          onOpenMigration={onOpenMigration}
          onOpenCapsule={onOpenCapsule}
        />
      ) : (
        <div className="grid place-items-center rounded-xl border bg-card p-10 text-sm text-muted-foreground">
          No at-risk dependencies found.
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<UsageKind, string> = {
  import: 'import',
  call: 'call',
  manifest: 'manifest',
  build: 'build',
}

function FindingDetail({
  analysis,
  finding,
  onOpenMigration,
  onOpenCapsule,
}: {
  analysis: AnalysisResult
  finding: DependencyFinding
  onOpenMigration: () => void
  onOpenCapsule: () => void
}) {
  const byFile = useMemo(() => {
    const map = new Map<string, DependencyFinding['usages']>()
    for (const u of finding.usages) map.set(u.file, [...(map.get(u.file) ?? []), u])
    return [...map.entries()].sort(
      ([, a], [, b]) =>
        Number(b.some((u) => u.kind !== 'manifest')) - Number(a.some((u) => u.kind !== 'manifest')),
    )
  }, [finding.usages])
  const codeCount = finding.usages.filter((u) => u.kind === 'import' || u.kind === 'call').length

  return (
    <section className="flex flex-col gap-6 rounded-xl border bg-card p-5" aria-labelledby="finding-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="finding-title" className="text-xl font-semibold tracking-tight">
              {finding.displayName}
            </h2>
            <SeverityBadge severity={finding.severity} />
          </div>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{finding.summary}</p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>pinned</dt>
              <dd className="text-foreground">{finding.pinnedVersion ?? '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>latest</dt>
              <dd className="text-foreground">{finding.latestVersion ?? '—'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>code refs</dt>
              <dd className="text-foreground">{codeCount}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right">
            <div className={cn('font-mono text-3xl font-semibold tabular-nums', SEVERITY_STYLES[finding.severity].text)}>
              {finding.score}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">risk score</div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={onOpenMigration}>
          <Route data-icon="inline-start" />
          Migration proposal
        </Button>
        <Button variant="outline" onClick={onOpenCapsule}>
          <PackageOpen data-icon="inline-start" />
          Exit capsule
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>Risk indicators</SectionLabel>
        <ul className="flex flex-col divide-y rounded-lg border">
          {finding.indicators.map((ind, i) => {
            const Icon = INDICATOR_ICONS[ind.kind]
            return (
              <li key={`${ind.kind}-${i}`} className="flex gap-3 p-3">
                <Icon
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    ind.kind === 'vulnerability' ? 'text-risk-critical' : 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-sm font-medium">{ind.label}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{ind.detail}</p>
                  {ind.refs && (
                    <ul className="mt-1 flex flex-col gap-1">
                      {ind.refs.map((r) => (
                        <li key={r.id}>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="group inline-flex max-w-full items-baseline gap-2 text-xs"
                          >
                            <span className="shrink-0 font-mono text-risk-critical group-hover:underline">{r.id}</span>
                            {r.summary && <span className="truncate text-muted-foreground">{r.summary}</span>}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Usage locations</SectionLabel>
          <span className="font-mono text-xs text-muted-foreground">
            {finding.usages.length} refs · {byFile.length} files
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {byFile.map(([file, usages]) => (
            <div key={file} className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
                <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-mono text-xs">{file}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{usages.length}</span>
              </div>
              <ul className="divide-y divide-border/60">
                {usages.map((u) => (
                  <li key={`${u.line}-${u.kind}`}>
                    <a
                      href={blobUrl(analysis, u.file, u.line)}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-3 px-3 py-1.5 hover:bg-accent/40"
                    >
                      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {u.line}
                      </span>
                      <span
                        className={cn(
                          'w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider',
                          u.kind === 'import' || u.kind === 'call' ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {KIND_LABEL[u.kind]}
                      </span>
                      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">{u.snippet}</code>
                      <ArrowUpRight
                        className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden="true"
                      />
                      <span className="sr-only">Open {u.file} line {u.line} on GitHub</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
