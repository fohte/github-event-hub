import { Webhooks } from '@octokit/webhooks'
import { Hono } from 'hono'

import { dispatch } from '@/dispatch'
import { logger } from '@/logger'
import type { SlackNotifier } from '@/slack'

export interface ServerDeps {
  webhookSecret: string
  notifier: SlackNotifier
}

export const createApp = (deps: ServerDeps): Hono => {
  const webhooks = new Webhooks({ secret: deps.webhookSecret })
  const app = new Hono()

  app.get('/healthz', (c) => c.text('ok'))

  app.post('/github', async (c) => {
    const deliveryId = c.req.header('x-github-delivery') ?? ''
    const event = c.req.header('x-github-event') ?? ''
    const signature = c.req.header('x-hub-signature-256') ?? ''
    const body = await c.req.text()

    if (signature === '' || event === '' || deliveryId === '') {
      logger.warn('webhook_bad_request', {
        delivery_id: deliveryId,
        event,
        reason: 'missing_headers',
      })
      return c.json({ error: 'missing required headers' }, 400)
    }

    let valid = false
    try {
      valid = await webhooks.verify(body, signature)
    } catch {
      valid = false
    }
    if (!valid) {
      logger.warn('webhook_invalid_signature', {
        delivery_id: deliveryId,
        event,
      })
      return c.json({ error: 'invalid signature' }, 401)
    }

    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch (err) {
      logger.warn('webhook_invalid_json', {
        delivery_id: deliveryId,
        event,
        error: err,
      })
      return c.json({ error: 'invalid json' }, 400)
    }

    try {
      const outcome = await dispatch(
        { deliveryId, event, notifier: deps.notifier },
        { name: event, payload },
      )
      logger.info('webhook_processed', {
        delivery_id: deliveryId,
        event,
        outcome,
      })
      return c.json({ ok: true, outcome })
    } catch (err) {
      logger.error('webhook_handler_error', {
        delivery_id: deliveryId,
        event,
        error: err,
      })
      // Return 200 so GitHub does not redeliver — handlers (e.g. Slack postMessage)
      // are not idempotent, and replays would surface as duplicate notifications.
      return c.json({ ok: false, outcome: 'error' }, 200)
    }
  })

  return app
}
