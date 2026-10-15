'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { FlaskConical, PackageOpen, Radar, Route } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { DEFAULT_SIM_CONFIG } from '@/lib/simulate'
import type { AnalysisResult, SimConfig } from '@/lib/types'
import { AppHeader } from './app-header'
import { RepoInput } from './repo-input'
import { SummaryStats } from './summary-stats'
import { RiskPanel } from './risk-panel'
import { MigrationPanel } from './migration-panel'
import { SimulatorPanel } from './simulator-panel'
import { CapsulePanel } from './capsule-panel'
import { DashboardSkeleton } from './dashboard-skeleton'

export const DEFAULT_REPO = 'https://github.com/rishrek/LinkWatch'

async function fetchAnalysis(repo: string): Promise<AnalysisResult> {
  const res = await fetch(`/api/analyze?repo=${encodeURIComponent(repo)}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Analysis failed')
  return body
}

type Tab = 'risk' | 'migration' | 'simulator' | 'capsule'

export function Dashboard() {
  const [repo, setRepo] = useState(DEFAULT_REPO)
  const { data, error, isValidating, mutate } = useSWR(['analyze', repo], ([, r]) => fetchAnalysis(r), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  const [tab, setTab] = useState<Tab>('risk')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [simConfig, setSimConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG)

  const selected = data?.findings.find((f) => f.id === selectedId) ?? data?.findings[0]

  const submit = (value: string) => {
    if (value === repo) mutate()
    else {
      setRepo(value)
      setSelectedId(null)
      setSimConfig(DEFAULT_SIM_CONFIG)
    }
  }

  const toggleApplied = (id: string) =>
    setSimConfig((c) => ({
      ...c,
      applied: c.applied.includes(id) ? c.applied.filter((x) => x !== id) : [...c.applied, id],
    }))

  return (
    <div className="min-h-dvh">
      <AppHeader sources={data?.sources} />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
        <RepoInput defaultValue={repo} loading={isValidating} onSubmit={submit} />

        {error && !isValidating && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-risk-critical/30 bg-risk-critical/5 px-4 py-3">
            <p className="text-sm text-risk-critical">{error.message}</p>
            <Button size="sm" variant="outline" onClick={() => mutate()}>
              Retry
            </Button>
          </div>
        )}

        {!data && !error && <DashboardSkeleton />}

        {data && (
          <div className={isValidating ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="flex flex-col gap-6">
              <SummaryStats analysis={data} />
              <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
                <div className="overflow-x-auto">
                  <TabsList variant="line" className="h-10 gap-2">
                    <TabsTrigger value="risk" className="px-3">
                      <Radar />
                      Risk analysis
                      <span className="font-mono text-xs text-muted-foreground">{data.findings.length}</span>
                    </TabsTrigger>
                    <TabsTrigger value="migration" className="px-3">
                      <Route />
                      Replacement &amp; migration
                    </TabsTrigger>
                    <TabsTrigger value="simulator" className="px-3">
                      <FlaskConical />
                      Test &amp; compatibility
                      {simConfig.applied.length > 0 && (
                        <span className="rounded-full bg-primary/15 px-1.5 font-mono text-[11px] text-primary">
                          {simConfig.applied.length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="capsule" className="px-3">
                      <PackageOpen />
                      Exit capsule
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="risk">
                  <RiskPanel
                    analysis={data}
                    selected={selected}
                    onSelect={setSelectedId}
                    onOpenMigration={() => setTab('migration')}
                    onOpenCapsule={() => setTab('capsule')}
                  />
                </TabsContent>
                <TabsContent value="migration">
                  <MigrationPanel
                    analysis={data}
                    selected={selected}
                    onSelect={setSelectedId}
                    applied={simConfig.applied}
                    onToggleApplied={toggleApplied}
                    onOpenSimulator={() => setTab('simulator')}
                  />
                </TabsContent>
                <TabsContent value="simulator">
                  <SimulatorPanel analysis={data} config={simConfig} onConfigChange={setSimConfig} />
                </TabsContent>
                <TabsContent value="capsule">
                  <CapsulePanel analysis={data} selected={selected} onSelect={setSelectedId} config={simConfig} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
