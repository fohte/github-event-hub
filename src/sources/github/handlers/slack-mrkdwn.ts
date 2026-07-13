// Slack requires &, <, > to be escaped in mrkdwn to avoid breaking link / entity syntax.
// https://api.slack.com/reference/surfaces/formatting#escaping
export const escapeSlackMrkdwn = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
