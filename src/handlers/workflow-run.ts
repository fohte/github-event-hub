import type { WorkflowRunCompletedEvent } from '@octokit/webhooks-types'

export interface WorkflowRunInput {
  repo: string
  workflow: string
  branch: string | null
  defaultBranch: string
  conclusion: WorkflowRunCompletedEvent['workflow_run']['conclusion']
  sha: string
  url: string
}

export interface WorkflowRunNotification {
  text: string
  repo: string
  workflow: string
  branch: string
  sha: string
  url: string
}

export const extractWorkflowRunInput = (
  payload: WorkflowRunCompletedEvent,
): WorkflowRunInput => ({
  repo: payload.repository.full_name,
  workflow: payload.workflow_run.name,
  branch: payload.workflow_run.head_branch,
  defaultBranch: payload.repository.default_branch,
  conclusion: payload.workflow_run.conclusion,
  sha: payload.workflow_run.head_sha,
  url: payload.workflow_run.html_url,
})

export const buildWorkflowRunNotification = (
  input: WorkflowRunInput,
): WorkflowRunNotification | null => {
  if (input.conclusion !== 'failure') return null
  if (input.branch === null) return null
  if (input.branch !== input.defaultBranch) return null
  const branch = input.branch

  const text = [
    `:rotating_light: *CI failure on \`${input.repo}\`*`,
    `Workflow: *${input.workflow}* (branch \`${branch}\`, commit \`${input.sha.slice(0, 7)}\`)`,
    `<${input.url}|View run>`,
  ].join('\n')

  return {
    text,
    repo: input.repo,
    workflow: input.workflow,
    branch,
    sha: input.sha,
    url: input.url,
  }
}
