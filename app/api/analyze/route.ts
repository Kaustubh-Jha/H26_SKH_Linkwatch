import { NextResponse, type NextRequest } from 'next/server'
import { AnalysisError, analyzeRepo } from '@/lib/analyze'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get('repo')
  if (!repo || repo.length > 300) {
    return NextResponse.json({ error: 'A repository URL is required.' }, { status: 400 })
  }
  try {
    const result = await analyzeRepo(repo)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' },
    })
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[analyze] unexpected failure', error)
    return NextResponse.json({ error: 'Analysis failed unexpectedly. Please try again.' }, { status: 500 })
  }
}
