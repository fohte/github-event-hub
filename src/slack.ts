import { WebClient } from '@slack/web-api'

export interface SlackNotifier {
  postMessage(text: string): Promise<void>
}

export const createSlackNotifier = (
  token: string,
  channel: string,
): SlackNotifier => {
  const client = new WebClient(token)
  return {
    async postMessage(text: string): Promise<void> {
      await client.chat.postMessage({ channel, text })
    },
  }
}
