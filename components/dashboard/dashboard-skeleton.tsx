export function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true" aria-label="Analyzing repository">
      <div className="h-6 w-64 rounded bg-muted" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-24 bg-card" />
        ))}
      </div>
      <div className="h-8 w-[28rem] max-w-full rounded bg-muted" />
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="h-[28rem] rounded-xl border bg-card" />
        <div className="h-[28rem] rounded-xl border bg-card" />
      </div>
    </div>
  )
}
