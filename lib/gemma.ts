import 'server-only'
import type { AnalysisResult, Severity } from './types'
import {
  GEMMA_ENDPOINT,
  type GemmaCapsule,
  type GemmaReport,
  type GemmaRisk,
  type GemmaTestOutcome,
  type GemmaUsageRef,
} from './gemma-types'

export class GemmaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low']
const OUTCOMES: GemmaTestOutcome[] = ['pass', 'warn', 'fail', 'skip']

function compactAnalysis(analysis: AnalysisResult) {
  return {
    repo: `${analysis.repo.owner}/${analysis.repo.name}@${analysis.repo.commit.slice(0, 7)}`,
    pythonRequires: analysis.repo.pythonRequires,
    stats: analysis.stats,
    tests: analysis.tests.slice(0, 40).map((t) => `${t.file}:${t.line} ${t.name}`),
    findings: analysis.findings.slice(0, 25).map((f) => ({
      name: f.displayName,
      pinned: f.pinnedVersion,
      latest: f.latestVersion,
      heuristicSeverity: f.severity,
      declared: f.declared.map((d) => `${d.file}:${d.line} ${d.raw}`),
      indicators: f.indicators.map((i) => ({
        kind: i.kind,
        label: i.label,
        detail: i.detail.slice(0, 300),
        advisories: i.refs?.slice(0, 5).map((r) => r.id),
      })),
      usages: f.usages.slice(0, 10).map((u) => `${u.file}:${u.line} ${u.snippet.slice(0, 140)}`),
      heuristicReplacement: `${f.replacement.name} ${f.replacement.version}`.trim(),
    })),
  }
}

function buildPrompt(analysis: AnalysisResult, target: string) {
  return `You are a senior Python supply-chain security engineer performing a dependency resilience review.

Below is a static scan of a GitHub repository: declared dependencies, risk indicators (including live OSV advisories and PyPI release data), exact source usage locations, and discovered tests.

SCAN DATA:
${JSON.stringify(compactAnalysis(analysis))}

TASK:
1. Rank the dependencies that are genuinely at risk (vulnerable, end-of-life, deprecated, unmaintained, conflicting, undeclared, unpinned). Ignore ones with no real risk. Cite only file/line locations that appear in the scan data.
2. Produce a "Dependency Exit Capsule" for the dependency "${target}": a self-contained hand-off document for removing or replacing it, including concrete migration steps, the tests from the scan data that exercise it with a predicted outcome after migration, compatibility gaps, and open limitations of this analysis.

Respond with ONLY a single JSON object, no prose and no markdown fences, matching exactly this shape:
{
  "overallRisk": "critical" | "high" | "medium" | "low",
  "summary": string,
  "risks": [
    {
      "dependency": string,
      "severity": "critical" | "high" | "medium" | "low",
      "reason": string,
      "usages": [{ "file": string, "line": number }],
      "recommendation": string
    }
  ],
  "capsule": {
    "dependency": string,
    "currentVersion": string | null,
    "severity": "critical" | "high" | "medium" | "low",
    "riskIndicators": string[],
    "usageLocations": [{ "file": string, "line": number, "snippet": string }],
    "replacement": { "name": string, "rationale": string },
    "migrationSteps": string[],
    "testResults": [{ "name": string, "outcome": "pass" | "warn" | "fail" | "skip", "note": string }],
    "compatibilityGaps": string[],
    "openLimitations": string[]
  }
}`
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback)
const strList = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : [])
const severity = (v: unknown): Severity => (SEVERITIES.includes(v as Severity) ? (v as Severity) : 'medium')

function usageList(v: unknown): GemmaUsageRef[] {
  if (!Array.isArray(v)) return []
  return v
    .map((u) => {
      if (typeof u === 'string') {
        const m = u.match(/^(.+?):(\d+)/)
        return m ? { file: m[1], line: Number(m[2]) } : { file: u, line: null }
      }
      const o = (u ?? {}) as Record<string, unknown>
      const line = Number(o.line)
      return { file: str(o.file), line: Number.isFinite(line) && line > 0 ? line : null, snippet: str(o.snippet) || undefined }
    })
    .filter((u) => u.file)
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end <= start) throw new GemmaError('Gemma did not return a JSON report.', 502)
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw new GemmaError('Gemma returned malformed JSON. Try again.', 502)
  }
}

function normalize(raw: unknown, target: string): GemmaReport {
  const o = (raw ?? {}) as Record<string, unknown>
  const risks: GemmaRisk[] = (Array.isArray(o.risks) ? o.risks : []).map((r) => {
    const x = (r ?? {}) as Record<string, unknown>
    return {
      dependency: str(x.dependency, 'unknown'),
      severity: severity(x.severity),
      reason: str(x.reason),
      usages: usageList(x.usages),
      recommendation: str(x.recommendation),
    }
  })
  risks.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity))

  const c = (o.capsule ?? {}) as Record<string, unknown>
  const rep = (c.replacement ?? {}) as Record<string, unknown>
  const capsule: GemmaCapsule = {
    dependency: str(c.dependency, target),
    currentVersion: str(c.currentVersion) || null,
    severity: severity(c.severity),
    riskIndicators: strList(c.riskIndicators),
    usageLocations: usageList(c.usageLocations),
    replacement: { name: str(rep.name, 'n/a'), rationale: str(rep.rationale) },
    migrationSteps: strList(c.migrationSteps),
    testResults: (Array.isArray(c.testResults) ? c.testResults : []).map((t) => {
      const x = (t ?? {}) as Record<string, unknown>
      const outcome = OUTCOMES.includes(x.outcome as GemmaTestOutcome) ? (x.outcome as GemmaTestOutcome) : 'skip'
      return { name: str(x.name, 'test'), outcome, note: str(x.note) }
    }),
    compatibilityGaps: strList(c.compatibilityGaps),
    openLimitations: strList(c.openLimitations),
  }

  return { overallRisk: severity(o.overallRisk), summary: str(o.summary), risks, capsule }
}

interface GeminiPart {
  text?: string
  thought?: boolean
}

export async function runGemma(apiKey: string, analysis: AnalysisResult, target: string) {
  let res: Response
  try {
    res = await fetch(GEMMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(analysis, target) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(110_000),
      cache: 'no-store',
    })
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError'
    throw new GemmaError(timedOut ? 'Gemma took too long to respond.' : 'Could not reach Google AI Studio.', 504)
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const message: string = body?.error?.message ?? `Google AI Studio returned HTTP ${res.status}.`
    const status = res.status === 400 && /api key/i.test(message) ? 401 : res.status
    throw new GemmaError(message, status)
  }

  const candidate = body?.candidates?.[0]
  const parts: GeminiPart[] = candidate?.content?.parts ?? []
  const text = parts
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('')
  if (!text) {
    const reason = candidate?.finishReason ?? body?.promptFeedback?.blockReason ?? 'empty response'
    throw new GemmaError(`Gemma returned no content (${reason}).`, 502)
  }

  return {
    report: normalize(extractJson(text), target),
    usage: {
      promptTokens: body?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: body?.usageMetadata?.candidatesTokenCount ?? null,
    },
  }
}
