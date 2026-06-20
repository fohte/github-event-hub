import type {
  PullRequestClosedEvent,
  PullRequestOpenedEvent,
} from '@octokit/webhooks-types'

import { escapeSlackMrkdwn } from '@/handlers/slack-mrkdwn'

export type PullRequestState = 'opened' | 'closed' | 'merged'

export interface PullRequestInput {
  repo: string
  title: string
  branch: string
  url: string
  state: PullRequestState
}

export interface PullRequestNotification {
  text: string
  color: string
  metadata: {
    event_type: 'security_pr'
    event_payload: { pr_url: string }
  }
  repo: string
  title: string
  url: string
  state: PullRequestState
}

const SECURITY_TITLE_SUFFIX = /\[security\]\s*$/
const RENOVATE_VULN_BRANCH = /^renovate\/.*-vulnerability$/

const STATE_META: Record<PullRequestState, { color: string; label: string }> = {
  opened: { color: '#36a64f', label: 'opened' },
  merged: { color: '#6f42c1', label: 'merged' },
  closed: { color: '#d73a49', label: 'closed' },
}

export const extractPullRequestInput = (
  payload: PullRequestOpenedEvent | PullRequestClosedEvent,
): PullRequestInput => ({
  repo: payload.repository.full_name,
  title: payload.pull_request.title,
  branch: payload.pull_request.head.ref,
  url: payload.pull_request.html_url,
  state:
    payload.action === 'opened'
      ? 'opened'
      : payload.pull_request.merged
        ? 'merged'
        : 'closed',
})

export const isSecurityPullRequest = (input: PullRequestInput): boolean =>
  SECURITY_TITLE_SUFFIX.test(input.title) ||
  RENOVATE_VULN_BRANCH.test(input.branch)

export const buildPullRequestNotification = (
  input: PullRequestInput,
): PullRequestNotification | null => {
  if (!isSecurityPullRequest(input)) return null

  const meta = STATE_META[input.state]
  const text = [
    `:lock: *Security PR ${meta.label} on \`${escapeSlackMrkdwn(input.repo)}\`*`,
    `*${escapeSlackMrkdwn(input.title)}*`,
    `<${input.url}|View pull request>`,
  ].join('\n')

  return {
    text,
    color: meta.color,
    metadata: {
      event_type: 'security_pr',
      event_payload: { pr_url: input.url },
    },
    repo: input.repo,
    title: input.title,
    url: input.url,
    state: input.state,
  }
}
