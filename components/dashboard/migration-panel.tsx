'use client'

import { ArrowRight, Check, FlaskConical, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AnalysisResult, DependencyFinding, Effort } from '@/lib/types'
import { FindingList } from './finding-list'
import { CodeDiff, SectionLabel, SeverityBadge } from './shared'

const EFFORT_STYLE: Record<Effort, string> = {
  trivial: 'text-success',
  low: 'text-primary',
  medium: 'text-risk-medium',
  high: 'text-risk-high',
}

export function MigrationPanel({
  analysis,
  selected,
  onSelect,
  applied,
  onToggleApplied,
  onOpenSimulator,
}: {
  analysis: AnalysisResult
  selected: DependencyFinding | undefined
  onSelect: (id: string) => void
  applied: string[]
  onToggleApplied: (id: string) => void
  onOpenSimulator: () => void
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="rounded-xl border bg-card p-3">
        <FindingList
          label="Migration proposals"
          variant="migration"
          findings={analysis.findings}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
        />
      </aside>
      {selected && (
        <Proposal
          finding={selected}
          isApplied={applied.includes(selected.id)}
          onToggleApplied={() => onToggleApplied(selected.id)}
          onOpenSimulator={onOpenSimulator}
        />
      )}
    </div>
  )
}

function Proposal({
  finding,
  isApplied,
  onToggleApplied,
  onOpenSimulator,
}: {
  finding: DependencyFinding
  isApplied: boolean
  onToggleApplied: () => void
  onOpenSimulator: () => void
}) {
  const r = finding.replacement
  return (
    <section className="flex flex-col gap-6 rounded-xl border bg-card p-5" aria-labelledby="proposal-title">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="proposal-title" className="text-xl font-semibold tracking-tight">
            Exit plan for {finding.displayName}
          </h2>
          <SeverityBadge severity={finding.severity} />
        </div>

        <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-lg border border-risk-critical/20 bg-risk-critical/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Current</p>
            <p className="mt-1 font-mono text-sm">{finding.name}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {finding.declared.filter((d) => d.scope !== 'build').map((d) => d.spec || 'any').join(' / ') || 'not declared'}
            </p>
          </div>
          <div className="grid place-items-center">
            <ArrowRight className="size-4 rotate-90 text-primary sm:rotate-0" aria-hidden="true" />
          </div>
          <div className="rounded-lg border border-success/25 bg-success/5 p-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Proposed · {r.kind}</p>
            <p className="mt-1 font-mono text-sm">{r.kind === 'remove' && r.name === finding.name ? 'remove' : r.name}</p>
            <p className="font-mono text-xs text-muted-foreground">{r.version}</p>
          </div>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{r.rationale}</p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
          <span className="text-muted-foreground">
            Effort <span className={cn('font-medium capitalize', EFFORT_STYLE[r.effort])}>{r.effort}</span>
          </span>
          <span className="text-muted-foreground">
            Steps <span className="font-mono text-foreground">{finding.steps.length}</span>
          </span>
          <span className="text-muted-foreground">
            Files touched{' '}
            <span className="font-mono text-foreground">
              {new Set(finding.steps.map((s) => s.file).filter(Boolean)).size}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant={isApplied ? 'secondary' : 'default'} onClick={onToggleApplied} aria-pressed={isApplied}>
            {isApplied ? <Check data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
            {isApplied ? 'In simulation plan' : 'Add to simulation plan'}
          </Button>
          <Button variant="outline" onClick={onOpenSimulator}>
            <FlaskConical data-icon="inline-start" />
            Open simulator
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <SectionLabel>Migration steps</SectionLabel>
        <ol className="flex flex-col gap-4">
          {finding.steps.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[auto_1fr] gap-3">
              <span className="grid size-6 place-items-center rounded-full border bg-background font-mono text-xs text-primary">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-sm font-medium">{step.title}</p>
                  {step.file && <code className="font-mono text-xs text-muted-foreground">{step.file}</code>}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                <CodeDiff before={step.before} after={step.after} />
              </div>
            </li>
          ))}
        </ol>
      </div>

      {r.alternatives && r.alternatives.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Alternatives considered</SectionLabel>
          <ul className="grid gap-2 sm:grid-cols-2">
            {r.alternatives.map((a) => (
              <li key={a.name} className="rounded-lg border p-3">
                <p className="font-mono text-sm">{a.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {finding.gaps.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Known compatibility gaps</SectionLabel>
          <ul className="flex flex-col gap-2">
            {finding.gaps.map((g) => (
              <li key={g} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-risk-medium" aria-hidden="true" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
