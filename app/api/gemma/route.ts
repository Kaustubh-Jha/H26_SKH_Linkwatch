import { NextResponse, type NextRequest } from 'next/server'
import { GemmaError, runGemma } from '@/lib/gemma'
import { GEMMA_MODEL, type GemmaResponse } from '@/lib/gemma-types'
import type { AnalysisResult } from '@/lib/types'

export const maxDuration = 120

const MAX_BODY_BYTES = 1_500_000

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-goog-api-key')?.trim()
  if (!apiKey || apiKey.length < 20 || apiKey.length > 200 || /\s/.test(apiKey)) {
    return NextResponse.json({ error: 'Enter a valid Google AI Studio API key.' }, { status: 401 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Analysis payload is too large.' }, { status: 413 })
  }

  let analysis: AnalysisResult
  let target: string
  try {
    const parsed = JSON.parse(raw) as { analysis?: AnalysisResult; target?: string }
    if (!parsed.analysis || !Array.isArray(parsed.analysis.findings) || !parsed.analysis.repo) throw new Error()
    analysis = parsed.analysis
    target = typeof parsed.target === 'string' && parsed.target.length < 120 ? parsed.target : analysis.findings[0]?.displayName ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid analysis payload.' }, { status: 400 })
  }

  if (analysis.findings.length === 0) {
    return NextResponse.json({ error: 'No dependencies were found to analyze.' }, { status: 422 })
  }

  try {
    const { report, usage } = await runGemma(apiKey, analysis, target)
    const response: GemmaResponse = { model: GEMMA_MODEL, generatedAt: new Date().toISOString(), report, usage }
    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof GemmaError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[gemma] unexpected failure', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Gemma analysis failed unexpectedly.' }, { status: 500 })
  }
}
