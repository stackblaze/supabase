import { APICallError } from 'ai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getModel } from './model'
import { ASSISTANT_MODELS, DEFAULT_COMPLETION_MODEL } from './model.utils'
import { billingUrlFromAiError, withBillingLink } from './stackblaze-errors'
import {
  aiErrorMessage,
  pickProxyModel,
  proxyErrorResponse,
  proxyReasoningEffort,
  resetProxyModelsCache,
  stackblazeAiConfig,
  StackblazeProxyError,
} from './stackblaze-proxy'

const ENV = {
  KUBERO_API_URL: 'https://dashboard-dev.example.com',
  KUBERO_APP_TOKEN: 'kbr_app_test',
}

const proxyError = (status: number, code: string, message: string) =>
  new APICallError({
    message,
    url: 'https://dashboard-dev.example.com/api/llm/v1/responses',
    requestBodyValues: {},
    statusCode: status,
    responseBody: JSON.stringify({ error: { message, type: 'stackblaze_proxy', code } }),
    data: { error: { message, type: 'stackblaze_proxy', code } },
  })

describe('StackBlaze AI proxy', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key]
      process.env[key] = value
    }
    resetProxyModelsCache()
  })

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    vi.restoreAllMocks()
  })

  it('is configured from KUBERO_API_URL and KUBERO_APP_TOKEN only', () => {
    expect(stackblazeAiConfig()).toEqual({
      baseURL: 'https://dashboard-dev.example.com/api/llm/v1',
      apiKey: 'kbr_app_test',
      dashboardUrl: 'https://dashboard-dev.example.com',
    })
    delete process.env.KUBERO_API_URL
    expect(stackblazeAiConfig()).toBeUndefined()
  })

  it('maps roles and requests onto the allowed models', () => {
    const allowed = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']
    expect(pickProxyModel(allowed, 'default')).toBe('openai/gpt-oss-120b')
    expect(pickProxyModel(allowed, 'fast')).toBe('openai/gpt-oss-20b')
    expect(pickProxyModel(allowed, 'default', 'openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b')
    // Studio's own ids are not on the list: the role decides.
    expect(pickProxyModel(allowed, 'default', 'gpt-6-luna')).toBe('openai/gpt-oss-120b')
    // One model serves every role.
    expect(pickProxyModel(['openai/gpt-oss-120b'], 'fast')).toBe('openai/gpt-oss-120b')
    expect(pickProxyModel([], 'default')).toBeUndefined()
  })

  it('clamps reasoning effort to low, medium or high', () => {
    expect(proxyReasoningEffort('none')).toBe('low')
    expect(proxyReasoningEffort('minimal')).toBe('low')
    expect(proxyReasoningEffort('medium')).toBe('medium')
    expect(proxyReasoningEffort('xhigh')).toBe('high')
    expect(proxyReasoningEffort('max')).toBe('high')
    expect(proxyReasoningEffort(undefined)).toBeUndefined()
  })

  it('shows the proxy message as is, with a billing link when out of credits', () => {
    const denied = proxyError(403, 'model_not_allowed', 'Model gpt-6-luna is not allowed')
    expect(aiErrorMessage(denied)).toBe('Model gpt-6-luna is not allowed')
    expect(proxyErrorResponse(denied)).toEqual({
      status: 403,
      message: 'Model gpt-6-luna is not allowed',
    })

    const paused = proxyError(
      402,
      'billing_paused',
      'AI is paused: the workspace is out of credits.'
    )
    const message = aiErrorMessage(paused)
    expect(message.startsWith('AI is paused: the workspace is out of credits.')).toBe(true)
    expect(billingUrlFromAiError(message)).toBe('https://dashboard-dev.example.com/billing')
    expect(proxyErrorResponse(paused)?.status).toBe(402)

    expect(proxyErrorResponse(new Error('other'))).toBeUndefined()
  })

  it('reads the billing link only from the message format the server writes', () => {
    expect(billingUrlFromAiError(withBillingLink('Out of credits.', 'https://d.example/'))).toBe(
      'https://d.example/billing'
    )
    expect(billingUrlFromAiError('Out of credits.')).toBeUndefined()
    expect(billingUrlFromAiError(undefined)).toBeUndefined()
  })

  it('getModel uses the proxy with an allowed model and no OpenAI key', async () => {
    const saveKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ object: 'list', data: [{ id: 'openai/gpt-oss-120b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    try {
      const assistant = await getModel({ provider: 'openai', modelEntry: ASSISTANT_MODELS[0] })
      expect(assistant.error).toBeUndefined()
      const model = assistant.modelParams!.model as { modelId: string }
      expect(model.modelId).toBe('openai/gpt-oss-120b')
      expect(assistant.modelParams!.providerOptions).toEqual({
        openai: { store: false, reasoningEffort: 'medium' },
      })

      const completion = await getModel({
        provider: 'openai',
        modelEntry: DEFAULT_COMPLETION_MODEL,
      })
      expect((completion.modelParams!.model as { modelId: string }).modelId).toBe(
        'openai/gpt-oss-120b'
      )

      // The model list is read once and cached.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        'https://dashboard-dev.example.com/api/llm/v1/models'
      )
      expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe(
        'Bearer kbr_app_test'
      )
    } finally {
      if (saveKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = saveKey
    }
  })

  it('getModel returns the proxy refusal when the app token may not use AI', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              'This app token may not use the AI model proxy (it lacks the `ai` capability).',
            type: 'stackblaze_proxy',
            code: 'token_scope_denied',
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    )

    const result = await getModel({ provider: 'openai', modelEntry: ASSISTANT_MODELS[0] })

    expect(result.error).toBeInstanceOf(StackblazeProxyError)
    expect(proxyErrorResponse(result.error)).toEqual({
      status: 403,
      message: 'This app token may not use the AI model proxy (it lacks the `ai` capability).',
    })
  })

  it('never passes a proxy 401 on to the browser', () => {
    const invalid = new StackblazeProxyError('Missing, invalid or expired turn token.', 401)
    expect(proxyErrorResponse(invalid)).toEqual({
      status: 502,
      message: 'Missing, invalid or expired turn token.',
    })
  })

  it('adds the billing link when listing models is refused for credits', () => {
    const paused = new StackblazeProxyError(
      'This workspace is paused for billing.',
      402,
      'billing_paused'
    )
    expect(billingUrlFromAiError(aiErrorMessage(paused))).toBe(
      'https://dashboard-dev.example.com/billing'
    )
  })

  it('getModel keeps the OpenAI key path without a hosting platform', async () => {
    delete process.env.KUBERO_API_URL
    const saveKey = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    try {
      const result = await getModel({ provider: 'openai', modelEntry: ASSISTANT_MODELS[0] })
      expect(result.error?.message).toBe('OPENAI_API_KEY not available')
    } finally {
      if (saveKey !== undefined) process.env.OPENAI_API_KEY = saveKey
    }
  })
})
