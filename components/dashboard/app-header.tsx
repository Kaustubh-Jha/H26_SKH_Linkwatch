import { ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AnalysisResult } from '@/lib/types'

export function AppHeader({ sources }: { sources?: AnalysisResult['sources'] }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <ShieldCheck className="size-4" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">LinkWatch</span>
          <span className="text-xs text-muted-foreground">Dependency Resilience</span>
        </div>
        <span className="ml-1 rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">Track 1</span>
        {sources && (
          <ul className="ml-auto hidden items-center gap-4 text-xs text-muted-foreground sm:flex" aria-label="Data sources">
            {(
              [
                ['GitHub', true],
                ['OSV', sources.osv],
                ['PyPI', sources.pypi],
              ] as const
            ).map(([label, ok]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', ok ? 'bg-success' : 'bg-risk-critical')} aria-hidden="true" />
                {label}
                <span className="sr-only">{ok ? 'connected' : 'unavailable'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  )
}
