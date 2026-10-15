'use client'

import {
  Archive,
  CalendarX2,
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CircleX,
  EyeOff,
  History,
  Hourglass,
  LockOpen,
  PackageMinus,
  PackageX,
  Scale,
  ShieldAlert,
  Split,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { IndicatorKind, Outcome, Severity } from '@/lib/types'

export const SEVERITY_STYLES: Record<Severity, { text: string; chip: string; bar: string; dot: string }> = {
  critical: {
    text: 'text-risk-critical',
    chip: 'border-risk-critical/30 bg-risk-critical/10 text-risk-critical',
    bar: 'bg-risk-critical',
    dot: 'bg-risk-critical',
  },
  high: {
    text: 'text-risk-high',
    chip: 'border-risk-high/30 bg-risk-high/10 text-risk-high',
    bar: 'bg-risk-high',
    dot: 'bg-risk-high',
  },
  medium: {
    text: 'text-risk-medium',
    chip: 'border-risk-medium/30 bg-risk-medium/10 text-risk-medium',
    bar: 'bg-risk-medium',
    dot: 'bg-risk-medium',
  },
  low: {
    text: 'text-risk-low',
    chip: 'border-risk-low/30 bg-risk-low/10 text-risk-low',
    bar: 'bg-risk-low',
    dot: 'bg-risk-low',
  },
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium uppercase tracking-wide',
        SEVERITY_STYLES[severity].chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', SEVERITY_STYLES[severity].dot)} aria-hidden="true" />
      {severity}
    </span>
  )
}

export function ScoreBar({ score, severity }: { score: number; severity: Severity }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 w-14 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Risk score"
      >
        <div className={cn('h-full rounded-full', SEVERITY_STYLES[severity].bar)} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{score}</span>
    </div>
  )
}

const OUTCOME_META: Record<Outcome, { icon: LucideIcon; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: 'text-success border-success/30 bg-success/10', label: 'Pass' },
  warn: { icon: CircleAlert, className: 'text-risk-medium border-risk-medium/30 bg-risk-medium/10', label: 'Warn' },
  fail: { icon: CircleX, className: 'text-risk-critical border-risk-critical/30 bg-risk-critical/10', label: 'Fail' },
  skip: { icon: CircleMinus, className: 'text-muted-foreground border-border bg-muted/50', label: 'Skip' },
}

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const meta = OUTCOME_META[outcome]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs font-medium',
        meta.className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export const OUTCOME_TEXT: Record<Outcome, string> = {
  pass: 'text-success',
  warn: 'text-risk-medium',
  fail: 'text-risk-critical',
  skip: 'text-muted-foreground',
}

export const INDICATOR_ICONS: Record<IndicatorKind, LucideIcon> = {
  vulnerability: ShieldAlert,
  eol: CalendarX2,
  deprecated: Archive,
  unmaintained: Hourglass,
  conflict: Split,
  'private-api': EyeOff,
  runtime: TriangleAlert,
  outdated: History,
  unpinned: LockOpen,
  undeclared: PackageX,
  unused: PackageMinus,
  license: Scale,
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground" id={`seg-${label}`}>
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`seg-${label}`}
        className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg border bg-background/40 p-0.5"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 rounded-md px-2.5 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              value === o.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</h3>
}

export function CodeDiff({ before, after }: { before?: string; after?: string }) {
  if (!before && !after) return null
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <CodePane label="Before" tone="remove" code={before} />
      <CodePane label="After" tone="add" code={after} />
    </div>
  )
}

function CodePane({ label, code, tone }: { label: string; code?: string; tone: 'add' | 'remove' }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        tone === 'remove' ? 'border-risk-critical/20 bg-risk-critical/5' : 'border-success/20 bg-success/5',
      )}
    >
      <div
        className={cn(
          'border-b px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider',
          tone === 'remove' ? 'border-risk-critical/20 text-risk-critical' : 'border-success/20 text-success',
        )}
      >
        {tone === 'remove' ? '−' : '+'} {label}
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground/90">
        {code ? code : <span className="italic text-muted-foreground">{tone === 'add' ? '(line removed)' : '(new)'}</span>}
      </pre>
    </div>
  )
}
