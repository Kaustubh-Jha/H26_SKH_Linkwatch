import type { Severity } from './types'

export const GEMMA_MODEL = 'gemma-4-26b-a4b-it'
export const GEMMA_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent`

export interface GemmaUsageRef {
  file: string
  line: number | null
  snippet?: string
}

export interface GemmaRisk {
  dependency: string
  severity: Severity
  reason: string
  usages: GemmaUsageRef[]
  recommendation: string
}

export type GemmaTestOutcome = 'pass' | 'warn' | 'fail' | 'skip'

export interface GemmaCapsule {
  dependency: string
  currentVersion: string | null
  severity: Severity
  riskIndicators: string[]
  usageLocations: GemmaUsageRef[]
  replacement: { name: string; rationale: string }
  migrationSteps: string[]
  testResults: { name: string; outcome: GemmaTestOutcome; note: string }[]
  compatibilityGaps: string[]
  openLimitations: string[]
}

export interface GemmaReport {
  overallRisk: Severity
  summary: string
  risks: GemmaRisk[]
  capsule: GemmaCapsule
}

export interface GemmaResponse {
  model: string
  generatedAt: string
  report: GemmaReport
  usage: { promptTokens: number | null; outputTokens: number | null }
}
