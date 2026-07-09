import '@/bootstrap'

import { serve } from '@hono/node-server'

import { loadConfig } from '@/config'
import { logger } from '@/logger'
import { createApp } from '@/server'
import { createSlackNotifier } from '@/slack'

const main = (): void => {
  const config = loadConfig()
  const notifier = createSlackNotifier(
    config.slackBotToken,
    config.slackChannel,
  )
  const app = createApp({
    webhookSecret: config.githubWebhookSecret,
    notifier,
  })
  serve({ fetch: app.fetch, port: config.port }, (info) => {
    logger.info('server_listening', { port: info.port })
  })
}

main()
