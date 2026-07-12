import type { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from '@/server'
import type { SlackNotifier } from '@/slack'
import type { DispatchOutcome, WebhookSource } from '@/webhook-source'

const createNotifier = (): SlackNotifier => ({
  postMessage: vi.fn(),
  updateMessage: vi.fn(),
  findMessageByMetadata: vi.fn(),
})

const createSource = (overrides: {
  name?: string
  path?: string
  verify: () => boolean
  dispatch: () => Promise<DispatchOutcome>
}): WebhookSource => ({
  name: overrides.name ?? 'dummy',
  path: overrides.path ?? '/dummy',
  extractContext: (headers) => {
    const deliveryId = headers.get('x-delivery')
    const eventName = headers.get('x-event')
    if (deliveryId === null || eventName === null) return null
    return { deliveryId, eventName }
  },
  verify: overrides.verify,
  dispatch: overrides.dispatch,
})

const validHeaders = { 'x-delivery': 'delivery-1', 'x-event': 'push' }

// Bundles status and body into one value so each test can assert the whole
// response with a single equality check.
const requestJson = async (
  app: Hono,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> => {
  const res = await app.request(path, init)
  return { status: res.status, body: await res.json() }
}

const requestText = async (
  app: Hono,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: string }> => {
  const res = await app.request(path, init)
  return { status: res.status, body: await res.text() }
}

describe('createApp', () => {
  it('responds to GET /healthz', async () => {
    const app = createApp({ sources: [], notifier: createNotifier() })

    const result = await requestText(app, '/healthz')

    expect(result).toEqual({ status: 200, body: 'ok' })
  })

  it('returns 200 with the outcome when dispatch succeeds', async () => {
    const source = createSource({
      verify: () => true,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })

    expect(result).toEqual({
      status: 200,
      body: { ok: true, outcome: 'notified' },
    })
  })

  it('returns 400 when required headers are missing', async () => {
    const source = createSource({
      verify: () => true,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      body: '{}',
    })

    expect(result).toEqual({
      status: 400,
      body: { error: 'missing required headers' },
    })
  })

  it('returns 401 when signature verification fails', async () => {
    const source = createSource({
      verify: () => false,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })

    expect(result).toEqual({
      status: 401,
      body: { error: 'invalid signature' },
    })
  })

  it('returns 401 when verify throws', async () => {
    const source = createSource({
      verify: () => {
        throw new Error('boom')
      },
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })

    expect(result).toEqual({
      status: 401,
      body: { error: 'invalid signature' },
    })
  })

  it('returns 400 when the body is not valid JSON', async () => {
    const source = createSource({
      verify: () => true,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      headers: validHeaders,
      body: 'not json',
    })

    expect(result).toEqual({
      status: 400,
      body: { error: 'invalid json' },
    })
  })

  it('returns 200 with outcome error when dispatch throws', async () => {
    const source = createSource({
      verify: () => true,
      dispatch: () => Promise.reject(new Error('boom')),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const result = await requestJson(app, '/dummy', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })

    expect(result).toEqual({
      status: 200,
      body: { ok: false, outcome: 'error' },
    })
  })

  it('returns 404 for an unregistered path', async () => {
    const source = createSource({
      verify: () => true,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({ sources: [source], notifier: createNotifier() })

    const res = await app.request('/unknown', { method: 'POST', body: '{}' })

    expect(res.status).toBe(404)
  })

  it('isolates a failing source from other registered sources', async () => {
    const failing = createSource({
      name: 'failing',
      path: '/failing',
      verify: () => true,
      dispatch: () => Promise.reject(new Error('boom')),
    })
    const healthy = createSource({
      name: 'healthy',
      path: '/healthy',
      verify: () => true,
      dispatch: () => Promise.resolve('notified'),
    })
    const app = createApp({
      sources: [failing, healthy],
      notifier: createNotifier(),
    })

    const failingRes = await app.request('/failing', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })
    const healthyResult = await requestJson(app, '/healthy', {
      method: 'POST',
      headers: validHeaders,
      body: '{}',
    })

    expect(failingRes.status).toBe(200)
    expect(healthyResult).toEqual({
      status: 200,
      body: { ok: true, outcome: 'notified' },
    })
  })
})
