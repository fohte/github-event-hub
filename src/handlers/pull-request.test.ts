import { describe, expect, it } from 'vitest'

import type { PullRequestInput } from '@/handlers/pull-request'
import {
  buildPullRequestNotification,
  isSecurityPullRequest,
} from '@/handlers/pull-request'

const baseInput = (
  overrides: Partial<PullRequestInput> = {},
): PullRequestInput => ({
  repo: 'fohte/example',
  title: 'chore(deps): update dependency foo',
  branch: 'renovate/foo-1.x',
  url: 'https://github.com/fohte/example/pull/1',
  ...overrides,
})

describe('isSecurityPullRequest', () => {
  it.each([
    {
      name: 'title ending with [security]',
      input: baseInput({ title: 'fix(deps): update tauri [security]' }),
      expected: true,
    },
    {
      name: 'renovate vulnerability branch',
      input: baseInput({ branch: 'renovate/crate-tauri-vulnerability' }),
      expected: true,
    },
    {
      name: 'plain renovate branch',
      input: baseInput({ branch: 'renovate/foo-1.x' }),
      expected: false,
    },
    {
      name: 'unrelated PR',
      input: baseInput({ title: 'feat: add thing', branch: 'feature/x' }),
      expected: false,
    },
    {
      name: 'title containing [security] but not at end',
      input: baseInput({ title: '[security] something else' }),
      expected: false,
    },
  ])('$name', ({ input, expected }) => {
    expect(isSecurityPullRequest(input)).toBe(expected)
  })
})

describe('buildPullRequestNotification', () => {
  it('returns a notification for security PRs', () => {
    const input = baseInput({
      title: 'fix(deps): update tauri [security]',
      branch: 'renovate/crate-tauri-vulnerability',
    })
    expect(buildPullRequestNotification(input)).toEqual({
      text: [
        ':lock: *Security PR opened on `fohte/example`*',
        '*fix(deps): update tauri [security]*',
        '<https://github.com/fohte/example/pull/1|View pull request>',
      ].join('\n'),
      repo: 'fohte/example',
      title: 'fix(deps): update tauri [security]',
      url: 'https://github.com/fohte/example/pull/1',
    })
  })

  it('escapes Slack mrkdwn metacharacters in title', () => {
    const input = baseInput({
      title: 'fix: support <T> generics [security]',
      branch: 'renovate/foo-vulnerability',
    })
    expect(buildPullRequestNotification(input)?.text).toBe(
      [
        ':lock: *Security PR opened on `fohte/example`*',
        '*fix: support &lt;T&gt; generics [security]*',
        '<https://github.com/fohte/example/pull/1|View pull request>',
      ].join('\n'),
    )
  })

  it('returns null for non-security PRs', () => {
    expect(buildPullRequestNotification(baseInput())).toBeNull()
  })
})
