import type {
  PullRequestOpenedEvent,
  WorkflowRunCompletedEvent,
} from '@octokit/webhooks-types'

import {
  buildPullRequestNotification,
  extractPullRequestInput,
} from '@/handlers/pull-request'
import {
  buildWorkflowRunNotification,
  extractWorkflowRunInput,
} from '@/handlers/workflow-run'
import { logger } from '@/logger'
import type { SlackNotifier } from '@/slack'

export type DispatchOutcome = 'notified' | 'filtered' | 'ignored'

export interface DispatchContext {
  deliveryId: string
  event: string
  notifier: SlackNotifier
}

interface ParsedEvent {
  name: string
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

export const dispatch = async (
  ctx: DispatchContext,
  parsed: ParsedEvent,
): Promise<DispatchOutcome> => {
  switch (parsed.name) {
    case 'workflow_run': {
      if (!hasAction(parsed.payload, 'completed')) return 'ignored'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- hasAction guard narrows the action literal but does not refine the payload union
      const typed = parsed.payload as WorkflowRunCompletedEvent
      const note = buildWorkflowRunNotification(extractWorkflowRunInput(typed))
      if (note === null) return 'filtered'
      await ctx.notifier.postMessage(note.text)
      logger.info('slack_notified', {
        delivery_id: ctx.deliveryId,
        event: 'workflow_run',
        repo: note.repo,
        workflow: note.workflow,
        url: note.url,
      })
      return 'notified'
    }
    case 'pull_request': {
      if (!hasAction(parsed.payload, 'opened')) return 'ignored'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- hasAction guard narrows the action literal but does not refine the payload union
      const typed = parsed.payload as PullRequestOpenedEvent
      const note = buildPullRequestNotification(extractPullRequestInput(typed))
      if (note === null) return 'filtered'
      await ctx.notifier.postMessage(note.text)
      logger.info('slack_notified', {
        delivery_id: ctx.deliveryId,
        event: 'pull_request',
        repo: note.repo,
        url: note.url,
      })
      return 'notified'
    }
    default:
      return 'ignored'
  }
}
