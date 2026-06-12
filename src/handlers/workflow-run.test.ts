import { describe, expect, it } from 'vitest'

import type { WorkflowRunInput } from '@/handlers/workflow-run'
import { buildWorkflowRunNotification } from '@/handlers/workflow-run'

const baseInput = (
  overrides: Partial<WorkflowRunInput> = {},
): WorkflowRunInput => ({
  repo: 'fohte/example',
  workflow: 'CI',
  branch: 'main',
  defaultBranch: 'main',
  conclusion: 'failure',
  sha: 'abcdef1234567890abcdef1234567890abcdef12',
  url: 'https://github.com/fohte/example/actions/runs/1',
  ...overrides,
})

describe('buildWorkflowRunNotification', () => {
  it('returns a notification for failed runs on the default branch', () => {
    expect(buildWorkflowRunNotification(baseInput())).toEqual({
      text: [
        ':rotating_light: *CI failure on `fohte/example`*',
        'Workflow: *CI* (branch `main`, commit `abcdef1`)',
        '<https://github.com/fohte/example/actions/runs/1|View run>',
      ].join('\n'),
      repo: 'fohte/example',
      workflow: 'CI',
      branch: 'main',
      sha: 'abcdef1234567890abcdef1234567890abcdef12',
      url: 'https://github.com/fohte/example/actions/runs/1',
    })
  })

  it.each([
    {
      name: 'conclusion is success',
      overrides: { conclusion: 'success' as const },
    },
    {
      name: 'conclusion is cancelled',
      overrides: { conclusion: 'cancelled' as const },
    },
    {
      name: 'head branch is not the default',
      overrides: { branch: 'feature/x' },
    },
    { name: 'head branch is null', overrides: { branch: null } },
  ])('returns null when $name', ({ overrides }) => {
    expect(buildWorkflowRunNotification(baseInput(overrides))).toBeNull()
  })
})
