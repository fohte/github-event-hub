import type { PullRequestOpenedEvent } from '@octokit/webhooks-types'

export interface PullRequestInput {
  repo: string
  title: string
  branch: string
  url: string
}

export interface PullRequestNotification {
  text: string
  repo: string
  title: string
  url: string
}

const SECURITY_TITLE_SUFFIX = /\[security\]\s*$/
const RENOVATE_VULN_BRANCH = /^renovate\/.*-vulnerability$/

export const extractPullRequestInput = (
  payload: PullRequestOpenedEvent,
): PullRequestInput => ({
  repo: payload.repository.full_name,
  title: payload.pull_request.title,
  branch: payload.pull_request.head.ref,
  url: payload.pull_request.html_url,
})

export const isSecurityPullRequest = (input: PullRequestInput): boolean =>
  SECURITY_TITLE_SUFFIX.test(input.title) ||
  RENOVATE_VULN_BRANCH.test(input.branch)

export const buildPullRequestNotification = (
  input: PullRequestInput,
): PullRequestNotification | null => {
  if (!isSecurityPullRequest(input)) return null

  const text = [
    `:lock: *Security PR opened on \`${input.repo}\`*`,
    `*${input.title}*`,
    `<${input.url}|View pull request>`,
  ].join('\n')

  return { text, repo: input.repo, title: input.title, url: input.url }
}
