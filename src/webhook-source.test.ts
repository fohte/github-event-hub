import { describe, expect, it, vi } from 'vitest'

import type { SlackNotifier } from '@/slack'
import type {
  DispatchOutcome,
  SourceContext,
  WebhookHeaders,
  WebhookSource,
} from '@/webhook-source'

const headersFrom = (values: Record<string, string>): WebhookHeaders => ({
  get: (name) => values[name] ?? null,
})

const createNotifier = (): SlackNotifier => ({
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
  findMessageByMetadata: vi.fn(),
})

// Returns the verify/dispatch mocks alongside the source so tests can assert
// on them directly, without extracting bound methods off `source`.
const createDummySource = () => {
  const verify = vi.fn((): boolean => true)
  const dispatch = vi.fn((): Promise<DispatchOutcome> =>
    Promise.resolve('notified'),
  )
  const source: WebhookSource = {
    name: 'dummy',
    path: '/dummy',
    extractContext: (headers) => {
      const deliveryId = headers.get('x-dummy-delivery')
      const eventName = headers.get('x-dummy-event')
      if (deliveryId === null || eventName === null) return null
      return { deliveryId, eventName }
    },
    verify,
    dispatch,
  }
  return { source, verify, dispatch }
}

// Stand-in for the HTTP shell's future pipeline: exercises the WebhookSource
// postcondition that a null extractContext short-circuits verify/dispatch.
const runSource = async (
  source: WebhookSource,
  rawBody: string,
  headers: WebhookHeaders,
  payload: unknown,
  notifier: SlackNotifier,
): Promise<SourceContext | null> => {
  const context = source.extractContext(headers)
  if (context === null) return null
  const verified = await source.verify(rawBody, headers, context)
  if (!verified) return null
  await source.dispatch(context, payload, notifier)
  return context
}

describe('WebhookSource contract', () => {
  it('short-circuits verify and dispatch when extractContext returns null', async () => {
    const { source, verify, dispatch } = createDummySource()
    const notifier = createNotifier()

    const result = await runSource(source, '{}', headersFrom({}), {}, notifier)

    expect(result).toBeNull()
    expect(verify).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('calls verify and dispatch when extractContext returns a context', async () => {
    const { source, verify, dispatch } = createDummySource()
    const notifier = createNotifier()
    const headers = headersFrom({
      'x-dummy-delivery': 'delivery-1',
      'x-dummy-event': 'push',
    })
    const payload = { ok: true }

    const result = await runSource(source, '{}', headers, payload, notifier)

    expect(result).toEqual({ deliveryId: 'delivery-1', eventName: 'push' })
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledWith('{}', headers, result)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(result, payload, notifier)
  })
})
