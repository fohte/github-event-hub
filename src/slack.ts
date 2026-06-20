import { WebClient } from '@slack/web-api'

export interface SlackMessageMetadata {
  event_type: string
  event_payload: Record<string, string | number | boolean>
}

export interface SlackMessageContent {
  text: string
  color?: string
  metadata?: SlackMessageMetadata
}

export interface SlackMessageRef {
  channel: string
  ts: string
}

export interface SlackNotifier {
  postMessage(content: SlackMessageContent): Promise<SlackMessageRef>
  updateMessage(
    ref: SlackMessageRef,
    content: SlackMessageContent,
  ): Promise<void>
  findMessageByMetadata(
    eventType: string,
    payloadMatcher: (payload: Record<string, unknown>) => boolean,
  ): Promise<SlackMessageRef | null>
}

interface MessagePayload {
  text: string
  attachments?: Array<{
    color: string
    text: string
    mrkdwn_in: ['text']
  }>
  metadata?: SlackMessageMetadata
}

const buildPayload = (content: SlackMessageContent): MessagePayload => {
  const payload: MessagePayload = { text: content.text }
  if (content.color !== undefined) {
    payload.attachments = [
      { color: content.color, text: content.text, mrkdwn_in: ['text'] },
    ]
  }
  if (content.metadata !== undefined) {
    payload.metadata = content.metadata
  }
  return payload
}

export const createSlackNotifier = (
  token: string,
  channel: string,
): SlackNotifier => {
  const client = new WebClient(token)
  // Cache the resolution Promise (not the result) so concurrent webhooks share
  // a single conversations.list pagination instead of racing against rate limits.
  let channelIdPromise: Promise<string> | null = null

  const resolveChannelId = (): Promise<string> => {
    if (channelIdPromise !== null) return channelIdPromise
    channelIdPromise = (async () => {
      if (!channel.startsWith('#')) return channel
      const name = channel.slice(1)
      let cursor = ''
      for (;;) {
        const res = await client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 1000,
          ...(cursor === '' ? {} : { cursor }),
        })
        const found = res.channels?.find((c) => c.name === name)
        if (found?.id !== undefined) return found.id
        const next = res.response_metadata?.next_cursor ?? ''
        if (next === '') break
        cursor = next
      }
      throw new Error(`Slack channel not found: ${channel}`)
    })().catch((err: unknown) => {
      channelIdPromise = null
      throw err
    })
    return channelIdPromise
  }

  return {
    async postMessage(content) {
      const channelId = await resolveChannelId()
      const res = await client.chat.postMessage({
        channel: channelId,
        ...buildPayload(content),
      })
      if (res.ts === undefined || res.channel === undefined) {
        throw new Error('Slack postMessage did not return ts/channel')
      }
      return { ts: res.ts, channel: res.channel }
    },
    async updateMessage(ref, content) {
      await client.chat.update({
        channel: ref.channel,
        ts: ref.ts,
        ...buildPayload(content),
      })
    },
    async findMessageByMetadata(eventType, payloadMatcher) {
      const channelId = await resolveChannelId()
      // Intentional single-page cap: a security PR's `opened` notification
      // is expected within recent history; older PRs fall back to a new post.
      const res = await client.conversations.history({
        channel: channelId,
        limit: 200,
        include_all_metadata: true,
      })
      const match = res.messages?.find((m) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Slack SDK types omit metadata on message history items
        const md = (m as { metadata?: SlackMessageMetadata }).metadata
        if (md === undefined) return false
        if (md.event_type !== eventType) return false
        return payloadMatcher(md.event_payload)
      })
      if (match?.ts === undefined) return null
      return { channel: channelId, ts: match.ts }
    },
  }
}
