import { createOpenAI } from '@ai-sdk/openai'
import { APICallError } from 'ai'

import type { ReasoningEffort } from './model.utils'
import { withBillingLink } from './stackblaze-errors'
import { IS_PLATFORM } from '@/lib/constants'

/**
 * Self-hosted Studio on the StackBlaze hosting platform runs its AI features on the platform's
 * OpenAI-compatible AI proxy, paid from the workspace's credits (kubero-server #2358). Base URL
 * `${KUBERO_API_URL}/api/llm/v1`; the key is this deployment's app token (KUBERO_APP_TOKEN, with
 * the `ai` capability). Plain self-hosted Studio (no KUBERO_API_URL) keeps the OPENAI_API_KEY path.
 */
export type StackblazeAiConfig = { baseURL: string; apiKey: string; dashboardUrl: string }

export function stackblazeAiConfig(): StackblazeAiConfig | undefined {
  if (IS_PLATFORM) return
  const apiUrl = process.env.KUBERO_API_URL?.trim().replace(/\/+$/, '')
  const apiKey = process.env.KUBERO_APP_TOKEN?.trim()
  if (!apiUrl || !apiKey) return
  let dashboardUrl = apiUrl
  try {
    dashboardUrl = new URL(apiUrl).origin
  } catch {
    // Keep the configured value.
  }
  return { baseURL: `${apiUrl}/api/llm/v1`, apiKey, dashboardUrl }
}

const MODELS_TTL_MS = 5 * 60 * 1000
let cachedModels: { at: number; ids: string[] } | undefined

/** The model ids the proxy allows (`GET /models`), cached for a few minutes. */
export async function listProxyModels(config: StackblazeAiConfig): Promise<string[]> {
  if (cachedModels && Date.now() - cachedModels.at < MODELS_TTL_MS) return cachedModels.ids
  const response = await fetch(`${config.baseURL}/models`, {
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: { message?: string } }
      | undefined
    throw new Error(
      body?.error?.message ?? `The StackBlaze AI proxy did not list its models (${response.status})`
    )
  }
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> }
  const ids = (body.data ?? [])
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
  cachedModels = { at: Date.now(), ids }
  return ids
}

/** For tests. */
export function resetProxyModelsCache() {
  cachedModels = undefined
}

export type ProxyModelRole = 'fast' | 'default'

const FAST_HINT = /(nano|mini|small|lite|flash|haiku|[^0-9]\d{1,2}b\b)/i

/**
 * Which allowed model to use: the requested one when the proxy allows it, else one for the role.
 * "fast" (short completions such as titles and filters) prefers a small model; "default" (the
 * Assistant, SQL and policy generation) prefers the first model that does not look small.
 */
export function pickProxyModel(
  allowed: string[],
  role: ProxyModelRole,
  requested?: string
): string | undefined {
  if (requested && allowed.includes(requested)) return requested
  if (allowed.length === 0) return
  const fast = allowed.find((id) => FAST_HINT.test(id))
  const large = allowed.find((id) => !FAST_HINT.test(id))
  return (role === 'fast' ? (fast ?? large) : (large ?? fast)) ?? allowed[0]
}

/** The proxy takes low, medium or high; Studio's levels are clamped to those. */
export function proxyReasoningEffort(
  effort: ReasoningEffort | undefined
): 'low' | 'medium' | 'high' | undefined {
  switch (effort) {
    case undefined:
      return undefined
    case 'none':
    case 'minimal':
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    default:
      return 'high'
  }
}

/** An OpenAI provider whose requests go to the StackBlaze AI proxy. */
export function createStackblazeProvider(config: StackblazeAiConfig) {
  return createOpenAI({ baseURL: config.baseURL, apiKey: config.apiKey })
}

/**
 * The message to show for an AI error. The proxy's own message is shown as is; when the
 * workspace is out of credits (402 billing_paused) it points to billing on the dashboard.
 */
export function aiErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
  const config = stackblazeAiConfig()
  if (!config || !APICallError.isInstance(error)) return message

  const code = proxyErrorCode(error)
  if (error.statusCode === 402 || code === 'billing_paused') {
    return withBillingLink(message, config.dashboardUrl)
  }
  return message
}

function proxyErrorCode(error: APICallError): string | undefined {
  const fromData = (error.data as { error?: { code?: unknown } } | undefined)?.error?.code
  if (typeof fromData === 'string') return fromData
  try {
    const body = JSON.parse(error.responseBody ?? '') as { error?: { code?: unknown } }
    return typeof body?.error?.code === 'string' ? body.error.code : undefined
  } catch {
    return undefined
  }
}

/**
 * For routes that answer with JSON: the status and message to send for an error from the
 * StackBlaze AI proxy, or undefined for any other error (the route keeps its own handling).
 */
export function proxyErrorResponse(
  error: unknown
): { status: number; message: string } | undefined {
  if (!stackblazeAiConfig() || !APICallError.isInstance(error)) return
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 502
  return { status, message: aiErrorMessage(error) }
}
