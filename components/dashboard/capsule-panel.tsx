'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, FileJson, FileText, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildCapsule, capsuleToMarkdown, type Capsule } from '@/lib/capsule'
import type { AnalysisResult, DependencyFinding, SimConfig } from '@/lib/types'
import { FindingList } from './finding-list'
import { CodeDiff, INDICATOR_ICONS, OutcomeBadge, SEVERITY_STYLES, SeverityBadge } from './shared'

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CapsulePanel({
  analysis,
  selected,
  onSelect,
  config,
}: {
  analysis: AnalysisResult
  selected: DependencyFinding | undefined
  onSelect: (id: string) => void
  config: SimConfig
}) {
  const capsule = useMemo(
    () => (selected ? buildCapsule(analysis, selected, config) : null),
    [analysis, selected, config],
  )
  const [copied, setCopied] = useState(false)

  const slug = selected ? `${analysis.repo.name.toLowerCase()}-${selected.name}-exit-capsule` : ''

  const exportAll = () => {
    const all = analysis.findings.map((f) => buildCapsule(analysis, f, config))
    download(
      `${analysis.repo.name.toLowerCase()}-exit-capsules.json`,
      JSON.stringify({ repository: analysis.repo, capsules: all }, null, 2),
      'application/json',
    )
  }

  const copyMarkdown = async () => {
    if (!capsule) return
    await navigator.clipboard.writeText(capsuleToMarkdown(capsule))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-3">
        <Button variant="outline" onClick={exportAll} className="w-full">
          <Layers data-icon="inline-start" />
          Export all {analysis.findings.length} capsules
        </Button>
        <FindingList
          label="Capsules"
          findings={analysis.findings}
          selectedId={selected?.id ?? null}
          onSelect={onSelect}
        />
      </aside>

      {capsule && (
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2.5">
            <p className="font-mono text-xs text-muted-foreground">
              {slug}.json · {capsule.schema}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => download(`${slug}.json`, JSON.stringify(capsule, null, 2), 'application/json')}
              >
                <FileJson data-icon="inline-start" />
                JSON
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(`${slug}.md`, capsuleToMarkdown(capsule), 'text/markdown')}
              >
                <FileText data-icon="inline-start" />
                Markdown
              </Button>
              <Button size="sm" variant="ghost" onClick={copyMarkdown}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <CapsuleDocument capsule={capsule} />
        </div>
      )}
    </div>
  )
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t px-6 py-5 md:grid-cols-[180px_1fr] md:gap-6">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        <span className="font-mono text-xs text-primary">{String(index).padStart(2, '0')}</span>
        {title}
      </h3>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function CapsuleDocument({ capsule: c }: { capsule: Capsule }) {
  const t = c.testResults
  return (
    <article className="overflow-hidden rounded-xl border bg-card" aria-label={`Exit capsule for ${c.dependency.displayName}`}>
      <header className="flex flex-col gap-4 px-6 py-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">Dependency Exit Capsule</p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">{c.dependency.displayName}</h2>
          <SeverityBadge severity={c.risk.severity} />
          <span className={cn('font-mono text-sm', SEVERITY_STYLES[c.risk.severity].text)}>{c.risk.score}/100</span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{c.risk.summary}</p>
        <dl className="grid gap-x-6 gap-y-2 font-mono text-xs sm:grid-cols-4">
          {[
            ['repository', c.repository.url.replace('https://github.com/', '')],
            ['commit', c.repository.commit.slice(0, 7)],
            ['python', c.repository.pythonRequires ?? '—'],
            ['generated', c.generatedAt.slice(0, 16).replace('T', ' ')],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <Section index={1} title="Dependency details">
        <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">pinned</dt>
            <dd>{c.dependency.pinnedVersion ?? 'not pinned'}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">latest</dt>
            <dd>{c.dependency.latestVersion ?? 'unknown'}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">released</dt>
            <dd>{c.dependency.latestReleaseDate?.slice(0, 10) ?? '—'}</dd>
          </div>
        </dl>
        {c.dependency.declared.length > 0 ? (
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {c.dependency.declared.map((d) => (
              <li key={`${d.file}:${d.line}`} className="flex gap-3">
                <span className="w-16 text-muted-foreground">{d.scope}</span>
                <span className="text-foreground">{d.spec}</span>
                <span className="text-muted-foreground">
                  {d.file}:{d.line}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not declared in any manifest.</p>
        )}
      </Section>

      <Section index={2} title="Risk indicators">
        <ul className="flex flex-col gap-3">
          {c.risk.indicators.map((i, idx) => {
            const Icon = INDICATOR_ICONS[i.kind]
            return (
              <li key={idx} className="flex gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.label}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{i.detail}</p>
                  {i.refs && (
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {i.refs.map((r) => (
                        <a
                          key={r.id}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-risk-critical hover:underline"
                        >
                          {r.id}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section index={3} title="Usage locations">
        <p className="mb-2 font-mono text-xs text-muted-foreground">
          {c.usage.total} total ·{' '}
          {Object.entries(c.usage.byKind)
            .map(([k, v]) => `${v} ${k}`)
            .join(' · ')}
        </p>
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
          {c.usage.locations.map((u) => (
            <li key={`${u.file}:${u.line}:${u.kind}`}>
              <a href={u.url} target="_blank" rel="noreferrer" className="flex gap-3 px-3 py-1.5 hover:bg-accent/40">
                <span className="w-40 shrink-0 truncate font-mono text-xs text-muted-foreground">
                  {u.file}:{u.line}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{u.snippet}</code>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section index={4} title="Migration steps">
        <p className="mb-4 text-sm">
          <span className="font-mono">{c.replacement.name}</span>{' '}
          <span className="font-mono text-muted-foreground">{c.replacement.version}</span>
          <span className="text-muted-foreground"> · {c.replacement.kind} · effort {c.replacement.effort}</span>
        </p>
        <ol className="flex flex-col gap-4">
          {c.migrationSteps.map((s, idx) => (
            <li key={s.title} className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                <span className="font-mono text-muted-foreground">{idx + 1}.</span> {s.title}
                {s.file && <code className="ml-2 font-mono text-xs text-muted-foreground">{s.file}</code>}
              </p>
              <p className="text-sm text-muted-foreground">{s.detail}</p>
              <CodeDiff before={s.before} after={s.after} />
            </li>
          ))}
        </ol>
      </Section>

      <Section index={5} title="Test results">
        <p className="mb-3 font-mono text-xs text-muted-foreground">
          static simulation · python {t.config.python} · {t.config.installFrom} · timeout{' '}
          {t.config.timeoutSeconds ?? 'none'}
        </p>
        {t.cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tests or checks are affected by this dependency.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Case
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Before
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.cases.map((tc) => (
                  <tr key={tc.name} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-mono text-xs">{tc.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{tc.file}</p>
                    </td>
                    <td className="px-3 py-2">
                      <OutcomeBadge outcome={tc.baseline} />
                    </td>
                    <td className="px-3 py-2">
                      <OutcomeBadge outcome={tc.candidate} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section index={6} title="Compatibility gaps">
        {c.compatibilityGaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">None identified.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {c.compatibilityGaps.map((g) => (
              <li key={g} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-risk-medium" aria-hidden="true" />
                {g}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section index={7} title="Open limitations">
        <ul className="flex flex-col gap-2">
          {c.openLimitations.map((l) => (
            <li key={l} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      </Section>
    </article>
  )
}
