import type {
  PullRequestClosedEvent,
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
import type { SlackMessageContent, SlackNotifier } from '@/slack'

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

const hasAnyAction = (
  payload: unknown,
  actions: readonly string[],
): payload is { action: string } =>
  typeof payload === 'object' &&
  payload !== null &&
  'action' in payload &&
  typeof payload.action === 'string' &&
  actions.includes(payload.action)

export const dispatch = async (
  ctx: DispatchContext,
  parsed: ParsedEvent,
): Promise<DispatchOutcome> => {
  switch (parsed.name) {
    case 'workflow_run': {
      if (!hasAnyAction(parsed.payload, ['completed'])) return 'ignored'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- payload union refinement
      const typed = parsed.payload as WorkflowRunCompletedEvent
      const note = buildWorkflowRunNotification(extractWorkflowRunInput(typed))
      if (note === null) return 'filtered'
      await ctx.notifier.postMessage({ text: note.text })
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
      if (!hasAnyAction(parsed.payload, ['opened', 'closed'])) return 'ignored'
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- payload union refinement
      const typed = parsed.payload as
        | PullRequestOpenedEvent
        | PullRequestClosedEvent
      const note = buildPullRequestNotification(extractPullRequestInput(typed))
      if (note === null) return 'filtered'

      const content: SlackMessageContent = {
        text: note.text,
        color: note.color,
        metadata: note.metadata,
      }

      if (note.state === 'opened') {
        await ctx.notifier.postMessage(content)
      } else {
        const existing = await ctx.notifier.findMessageByMetadata(
          'security_pr',
          (p) => p['pr_url'] === note.url,
        )
        if (existing !== null) {
          await ctx.notifier.updateMessage(existing, content)
        } else {
          logger.info('slack_original_not_found', {
            delivery_id: ctx.deliveryId,
            event: 'pull_request',
            state: note.state,
            url: note.url,
          })
          await ctx.notifier.postMessage(content)
        }
      }

      logger.info('slack_notified', {
        delivery_id: ctx.deliveryId,
        event: 'pull_request',
        state: note.state,
        repo: note.repo,
        url: note.url,
      })
      return 'notified'
    }
    default:
      return 'ignored'
  }
}
