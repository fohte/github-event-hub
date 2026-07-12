import '@/bootstrap'

import { serve } from '@hono/node-server'
import { Webhooks } from '@octokit/webhooks'

import { loadConfig } from '@/config'
import { dispatch } from '@/dispatch'
import { logger } from '@/logger'
import { createApp } from '@/server'
import { createSlackNotifier } from '@/slack'
import type { WebhookSource } from '@/webhook-source'

const createGithubSource = (webhookSecret: string): WebhookSource => {
  const webhooks = new Webhooks({ secret: webhookSecret })
  return {
    name: 'github',
    path: '/github',
    extractContext: (headers) => {
      const deliveryId = headers.get('x-github-delivery')
      const eventName = headers.get('x-github-event')
      const signature = headers.get('x-hub-signature-256')
      if (deliveryId === null || eventName === null || signature === null) {
        return null
      }
      return { deliveryId, eventName }
    },
    verify: (rawBody, headers) =>
      // extractContext already rejected a missing signature header, so this
      // is never called with an empty string (@octokit/webhooks-methods
      // throws TypeError on a falsy signature).
      webhooks.verify(rawBody, headers.get('x-hub-signature-256') ?? ''),
    dispatch: (context, payload, notifier) =>
      dispatch(
        { deliveryId: context.deliveryId, event: context.eventName, notifier },
        { name: context.eventName, payload },
      ),
  }
}

const main = (): void => {
  const config = loadConfig()
  const notifier = createSlackNotifier(
    config.slackBotToken,
    config.slackChannel,
  )
  const app = createApp({
    sources: [createGithubSource(config.githubWebhookSecret)],
    notifier,
  })
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info('server_listening', { port: info.port })
  })
}

main()
