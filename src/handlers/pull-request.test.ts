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
  state: 'opened',
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
  it.each([
    { state: 'opened' as const, label: 'opened', color: '#36a64f' },
    { state: 'merged' as const, label: 'merged', color: '#6f42c1' },
    { state: 'closed' as const, label: 'closed', color: '#d73a49' },
  ])(
    'returns a $color-bordered notification for $state security PRs',
    ({ state, label, color }) => {
      const input = baseInput({
        title: 'fix(deps): update tauri [security]',
        branch: 'renovate/crate-tauri-vulnerability',
        state,
      })
      expect(buildPullRequestNotification(input)).toEqual({
        text: [
          `:lock: *Security PR ${label} on \`fohte/example\`*`,
          '*fix(deps): update tauri [security]*',
          '<https://github.com/fohte/example/pull/1|View pull request>',
        ].join('\n'),
        color,
        metadata: {
          event_type: 'security_pr',
          event_payload: { pr_url: 'https://github.com/fohte/example/pull/1' },
        },
        repo: 'fohte/example',
        title: 'fix(deps): update tauri [security]',
        url: 'https://github.com/fohte/example/pull/1',
        state,
      })
    },
  )

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
