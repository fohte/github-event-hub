import { Hono } from 'hono'

import { logger } from '@/logger'
import type { SlackNotifier } from '@/slack'
import type { WebhookHeaders, WebhookSourceRegistry } from '@/webhook-source'

export interface CreateAppDeps {
  sources: WebhookSourceRegistry
  notifier: SlackNotifier
}

export const createApp = (deps: CreateAppDeps): Hono => {
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  for (const source of deps.sources) {
    app.post(source.path, async (c) => {
      const headers: WebhookHeaders = {
        get: (name) => c.req.header(name) ?? null,
      }

      const context = source.extractContext(headers)
      if (context === null) {
        logger.warn('webhook_bad_request', {
          source: source.name,
          reason: 'missing_headers',
        })
        return c.json({ error: 'missing required headers' }, 400)
      }

      const rawBody = await c.req.text()

      let verified = false
      try {
        verified = await source.verify(rawBody, headers, context)
      } catch {
        verified = false
      }
      if (!verified) {
        logger.warn('webhook_invalid_signature', {
          source: source.name,
          delivery_id: context.deliveryId,
          event: context.eventName,
        })
        return c.json({ error: 'invalid signature' }, 401)
      }

      let payload: unknown
      try {
        payload = JSON.parse(rawBody)
      } catch (err) {
        logger.warn('webhook_invalid_json', {
          source: source.name,
          delivery_id: context.deliveryId,
          event: context.eventName,
          error: err,
        })
        return c.json({ error: 'invalid json' }, 400)
      }

      try {
        const outcome = await source.dispatch(context, payload, deps.notifier)
        logger.info('webhook_processed', {
          source: source.name,
          delivery_id: context.deliveryId,
          event: context.eventName,
          outcome,
        })
        return c.json({ ok: true, outcome })
      } catch (err) {
        logger.error('webhook_handler_error', {
          source: source.name,
          delivery_id: context.deliveryId,
          event: context.eventName,
          error: err,
        })
        // Return 200 to suppress the source's redelivery; handler failures are not retried.
        return c.json({ ok: false, outcome: 'error' }, 200)
      }
    })
  }

  return app
}
