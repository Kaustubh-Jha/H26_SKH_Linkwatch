'use client'

import { useMemo, useState } from 'react'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { RULES_BY_ID } from '@/lib/rules'
import { PYTHON_VERSIONS, simulate, type OutcomeCounts, type SimRow } from '@/lib/simulate'
import type { AnalysisResult, InstallSource, Outcome, PythonVersion, SimConfig } from '@/lib/types'
import { OUTCOME_TEXT, OutcomeBadge, SEVERITY_STYLES, Segmented, SectionLabel } from './shared'

const TIMEOUTS = ['none', '5', '7', '10', '30'] as const
const RANK: Record<Outcome, number> = { pass: 0, skip: 1, warn: 2, fail: 3 }

export function SimulatorPanel({
  analysis,
  config,
  onConfigChange,
}: {
  analysis: AnalysisResult
  config: SimConfig
  onConfigChange: (config: SimConfig) => void
}) {
  const [onlyAffected, setOnlyAffected] = useState(true)
  const result = useMemo(() => simulate(analysis, config), [analysis, config])
  const matrix = useMemo(
    () => PYTHON_VERSIONS.map((python) => ({ python, ...simulate(analysis, { ...config, python }) })),
    [analysis, config],
  )
  const rows = onlyAffected
    ? result.rows.filter((r) => r.baseline.reasons.length || r.candidate.reasons.length)
    : result.rows

  const toggle = (id: string) =>
    onConfigChange({
      ...config,
      applied: config.applied.includes(id) ? config.applied.filter((x) => x !== id) : [...config.applied, id],
    })

  const modeled = analysis.findings.filter((f) => f.ruleId && RULES_BY_ID.get(f.ruleId)?.impact)

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <aside className="flex flex-col gap-5 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">Environment</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Outcomes are predicted from known breaking changes against the discovered test suite. No code is executed.
          </p>
        </div>
        <Segmented<PythonVersion>
          label="Python"
          value={config.python}
          options={PYTHON_VERSIONS.map((v) => ({ value: v, label: v }))}
          onChange={(python) => onConfigChange({ ...config, python })}
        />
        <Segmented<InstallSource>
          label="Install from"
          value={config.installFrom}
          options={[
            { value: 'requirements', label: 'requirements.txt' },
            { value: 'pyproject', label: 'pyproject.toml' },
          ]}
          onChange={(installFrom) => onConfigChange({ ...config, installFrom })}
        />
        <Segmented<(typeof TIMEOUTS)[number]>
          label="HTTP timeout (s) after requests migration"
          value={config.timeout === null ? 'none' : (String(config.timeout) as (typeof TIMEOUTS)[number])}
          options={TIMEOUTS.map((t) => ({ value: t, label: t }))}
          onChange={(t) => onConfigChange({ ...config, timeout: t === 'none' ? null : Number(t) })}
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Migrations to apply</span>
            <div className="flex gap-1">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onConfigChange({ ...config, applied: analysis.findings.map((f) => f.id) })}
              >
                All
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onConfigChange({ ...config, applied: [] })}>
                None
              </Button>
            </div>
          </div>
          <ul className="flex flex-col gap-0.5">
            {analysis.findings.map((f) => {
              const id = `apply-${f.id}`
              const hasModel = modeled.includes(f)
              return (
                <li key={f.id}>
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40"
                  >
                    <Checkbox id={id} checked={config.applied.includes(f.id)} onCheckedChange={() => toggle(f.id)} />
                    <span className={cn('size-1.5 rounded-full', SEVERITY_STYLES[f.severity].dot)} aria-hidden="true" />
                    <span className="truncate text-sm">{f.displayName}</span>
                    {!hasModel && (
                      <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                        no test impact
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr]">
          <SummaryCard title="Baseline" subtitle="Current pins" counts={result.baseline} />
          <div className="hidden place-items-center md:grid">
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <SummaryCard
            title="Candidate"
            subtitle={`${config.applied.length} migration${config.applied.length === 1 ? '' : 's'} applied`}
            counts={result.candidate}
            highlight
          />
        </div>

        <section className="rounded-xl border bg-card p-4" aria-labelledby="matrix-title">
          <h2 id="matrix-title" className="mb-3 text-sm font-semibold">
            Python compatibility matrix
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Failures and warnings per Python version</caption>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th scope="col" className="pb-2 font-medium">
                    Plan
                  </th>
                  {matrix.map((m) => (
                    <th
                      key={m.python}
                      scope="col"
                      className={cn('pb-2 font-mono font-medium', m.python === config.python && 'text-primary')}
                    >
                      {m.python}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['baseline', 'candidate'] as const).map((key) => (
                  <tr key={key} className="border-t">
                    <th scope="row" className="py-2 text-left font-medium capitalize">
                      {key}
                    </th>
                    {matrix.map((m) => (
                      <td key={m.python} className="py-2">
                        <MatrixCell counts={m[key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-card" aria-labelledby="results-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 id="results-title" className="text-sm font-semibold">
              Test &amp; check comparison
            </h2>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={onlyAffected} onCheckedChange={setOnlyAffected} />
              Only affected
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Case
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Baseline
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">
                    Candidate
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ResultRow key={r.id} row={r} />
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No tests are affected by the modeled changes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <SectionLabel>{`${analysis.tests.length} tests discovered · ${result.rows.length - analysis.tests.length} environment checks`}</SectionLabel>
      </div>
    </div>
  )
}

function SummaryCard({
  title,
  subtitle,
  counts,
  highlight,
}: {
  title: string
  subtitle: string
  counts: OutcomeCounts
  highlight?: boolean
}) {
  const total = counts.pass + counts.warn + counts.fail + counts.skip || 1
  return (
    <div className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4', highlight && 'border-primary/30')}>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="bg-success" style={{ width: `${(counts.pass / total) * 100}%` }} />
        <div className="bg-risk-medium" style={{ width: `${(counts.warn / total) * 100}%` }} />
        <div className="bg-risk-critical" style={{ width: `${(counts.fail / total) * 100}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${(counts.skip / total) * 100}%` }} />
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {(['pass', 'warn', 'fail', 'skip'] as const).map((k) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className={cn('font-mono text-xl font-semibold tabular-nums', OUTCOME_TEXT[k])}>{counts[k]}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function MatrixCell({ counts }: { counts: OutcomeCounts }) {
  if (counts.fail === 0 && counts.warn === 0) {
    return <span className="font-mono text-xs text-success">all green</span>
  }
  return (
    <span className="flex gap-2 font-mono text-xs">
      {counts.fail > 0 && <span className="text-risk-critical">{counts.fail} fail</span>}
      {counts.warn > 0 && <span className="text-risk-medium">{counts.warn} warn</span>}
    </span>
  )
}

function ResultRow({ row }: { row: SimRow }) {
  const delta = RANK[row.candidate.outcome] - RANK[row.baseline.outcome]
  const notes = row.candidate.reasons.length ? row.candidate.reasons : row.baseline.reasons
  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          {delta < 0 && <TrendingUp className="size-3.5 text-success" aria-label="Improved" />}
          {delta > 0 && <TrendingDown className="size-3.5 text-risk-critical" aria-label="Regressed" />}
          <span className={cn('font-mono text-xs', row.kind === 'check' && 'font-sans text-sm font-medium')}>
            {row.name}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {row.file}
          {row.line ? `:${row.line}` : ''}
        </p>
      </td>
      <td className="px-2 py-2.5">
        <OutcomeBadge outcome={row.baseline.outcome} />
      </td>
      <td className="px-2 py-2.5">
        <OutcomeBadge outcome={row.candidate.outcome} />
      </td>
      <td className="px-4 py-2.5">
        <ul className="flex flex-col gap-1">
          {notes.map((n, i) => (
            <li key={i} className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/80">{n.source}</span> — {n.text}
            </li>
          ))}
          {notes.length === 0 && <li className="text-xs text-muted-foreground">Unaffected</li>}
        </ul>
      </td>
    </tr>
  )
}
