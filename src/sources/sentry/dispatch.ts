import { logger } from '@/logger'
import type { SlackNotifier } from '@/slack'
import type { SentryIssueAlertEvent } from '@/sources/sentry/handlers/issue-alert'
import {
  buildIssueAlertNotification,
  extractIssueAlertInput,
} from '@/sources/sentry/handlers/issue-alert'
import type { DispatchOutcome } from '@/webhook-source'

export interface DispatchContext {
  deliveryId: string
  notifier: SlackNotifier
}

interface ParsedEvent {
  resource: string
  payload: unknown
}

const hasAction = (
  payload: unknown,
  action: string,
): payload is { action: string } =>
  typeof payload === 'object' &&
  payload !== null &&
  'action' in payload &&
  payload.action === action

// Sentry defines no extra filter stage beyond recognizing a triggered
// event_alert, so both branches below return "ignored" rather than
// "filtered" — there is nothing recognized-but-excluded to distinguish.
export const dispatch = async (
  ctx: DispatchContext,
  parsed: ParsedEvent,
): Promise<DispatchOutcome> => {
  if (parsed.resource !== 'event_alert') return 'ignored'
  if (!hasAction(parsed.payload, 'triggered')) return 'ignored'

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- payload shape refinement
  const typed = parsed.payload as SentryIssueAlertEvent
  const note = buildIssueAlertNotification(extractIssueAlertInput(typed))
  if (note === null) return 'ignored'

  await ctx.notifier.postMessage({ text: note.text })
  logger.info('slack_notified', {
    delivery_id: ctx.deliveryId,
    event: 'sentry_issue_alert',
    title: note.title,
    level: note.level,
    url: note.webUrl,
  })
  return 'notified'
}
