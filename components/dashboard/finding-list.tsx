'use client'

import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DependencyFinding } from '@/lib/types'
import { SEVERITY_STYLES, ScoreBar } from './shared'

export function FindingList({
  findings,
  selectedId,
  onSelect,
  variant = 'risk',
  label,
}: {
  findings: DependencyFinding[]
  selectedId: string | null
  onSelect: (id: string) => void
  variant?: 'risk' | 'migration'
  label: string
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-1">
      {findings.map((f) => {
        const active = f.id === selectedId
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f.id)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'group flex w-full flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              active ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:border-border hover:bg-accent/40',
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cn('size-2 shrink-0 rounded-full', SEVERITY_STYLES[f.severity].dot)} aria-hidden="true" />
              <span className="truncate text-sm font-medium">{f.displayName}</span>
              {f.pinnedVersion && (
                <span className="font-mono text-xs text-muted-foreground">{f.pinnedVersion}</span>
              )}
              <span className="sr-only">{f.severity} severity</span>
              <span className="ml-auto">
                <ScoreBar score={f.score} severity={f.severity} />
              </span>
            </div>
            {variant === 'risk' ? (
              <p className="line-clamp-1 pl-4 text-xs text-muted-foreground">
                {f.indicators.map((i) => i.label).join(' · ')}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 pl-4 font-mono text-xs text-muted-foreground">
                <span className="truncate">{f.name}</span>
                <ArrowRight className="size-3 shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate text-foreground/80">
                  {f.replacement.kind === 'remove' ? 'remove' : f.replacement.name}
                </span>
              </p>
            )}
          </button>
        )
      })}
    </nav>
  )
}
