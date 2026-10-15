'use client'

import { useState } from 'react'
import { FolderGit2, LoaderCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function RepoInput({
  defaultValue,
  loading,
  onSubmit,
}: {
  defaultValue: string
  loading: boolean
  onSubmit: (value: string) => void
}) {
  const [value, setValue] = useState(defaultValue)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const cleaned = value.replace(/\s+/g, '')
        if (cleaned) {
          setValue(cleaned)
          onSubmit(cleaned)
        }
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="repo-url" className="text-xs font-medium text-muted-foreground">
        Repository
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <FolderGit2
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="repo-url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            autoComplete="off"
            className="h-10 pl-9 font-mono text-sm"
          />
        </div>
        <Button type="submit" size="lg" className="h-10 px-4" disabled={loading}>
          {loading ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Search data-icon="inline-start" />}
          {loading ? 'Analyzing' : 'Analyze'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Scans Python manifests and sources on the default branch, enriched with live OSV advisories and PyPI release data.
      </p>
    </form>
  )
}
