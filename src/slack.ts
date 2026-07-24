import { WebClient } from '@slack/web-api'
import { err, ok, type Result, ResultAsync } from 'neverthrow'

export class SlackApiError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'SlackApiError'
  }
}

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
  postMessage(
    content: SlackMessageContent,
  ): ResultAsync<SlackMessageRef, SlackApiError>
  updateMessage(
    ref: SlackMessageRef,
    content: SlackMessageContent,
  ): ResultAsync<void, SlackApiError>
  findMessageByMetadata(
    eventType: string,
    payloadMatcher: (payload: Record<string, unknown>) => boolean,
  ): ResultAsync<SlackMessageRef | null, SlackApiError>
}

type MessagePayload = { metadata?: SlackMessageMetadata } & (
  | { text: string; attachments?: never }
  | {
      attachments: Array<{ color: string; text: string; mrkdwn_in: ['text'] }>
      text?: never
    }
)

const buildPayload = (content: SlackMessageContent): MessagePayload => {
  // Slack renders the coloured border only when the body lives inside the attachment.
  const base: MessagePayload =
    content.color !== undefined
      ? {
          attachments: [
            { color: content.color, text: content.text, mrkdwn_in: ['text'] },
          ],
        }
      : { text: content.text }
  return content.metadata !== undefined
    ? { ...base, metadata: content.metadata }
    : base
}

export const createSlackNotifier = (
  token: string,
  channel: string,
): SlackNotifier => {
  const client = new WebClient(token)
  let cachedChannelId: ResultAsync<string, SlackApiError> | null = null

  const resolveChannelIdUncached = (): ResultAsync<string, SlackApiError> =>
    ResultAsync.fromPromise(
      (async (): Promise<Result<string, SlackApiError>> => {
        if (!channel.startsWith('#')) return ok(channel)
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
          if (found?.id !== undefined) return ok(found.id)
          const next = res.response_metadata?.next_cursor ?? ''
          if (next === '') break
          cursor = next
        }
        return err(new SlackApiError(`Slack channel not found: ${channel}`))
      })(),
      (caughtErr) =>
        new SlackApiError('failed to resolve Slack channel id', caughtErr),
    ).andThen((result) => result)

  const resolveChannelId = (): ResultAsync<string, SlackApiError> => {
    if (cachedChannelId !== null) return cachedChannelId
    const resolved = resolveChannelIdUncached().mapErr((caughtErr) => {
      cachedChannelId = null
      return caughtErr
    })
    cachedChannelId = resolved
    return resolved
  }

  return {
    postMessage(content) {
      return resolveChannelId().andThen((channelId) =>
        ResultAsync.fromPromise(
          client.chat.postMessage({
            channel: channelId,
            ...buildPayload(content),
          }),
          (caughtErr) =>
            new SlackApiError('failed to post Slack message', caughtErr),
        ).andThen((res) =>
          res.ts === undefined || res.channel === undefined
            ? err(
                new SlackApiError(
                  'Slack postMessage did not return ts/channel',
                ),
              )
            : ok({ ts: res.ts, channel: res.channel }),
        ),
      )
    },
    updateMessage(ref, content) {
      return ResultAsync.fromPromise(
        client.chat.update({
          channel: ref.channel,
          ts: ref.ts,
          ...buildPayload(content),
        }),
        (caughtErr) =>
          new SlackApiError('failed to update Slack message', caughtErr),
      ).map(() => undefined)
    },
    findMessageByMetadata(eventType, payloadMatcher) {
      return resolveChannelId().andThen((channelId) =>
        ResultAsync.fromPromise(
          client.conversations.history({
            channel: channelId,
            limit: 200,
            include_all_metadata: true,
          }),
          (caughtErr) =>
            new SlackApiError(
              'failed to fetch Slack conversation history',
              caughtErr,
            ),
        ).map((res) => {
          const match = res.messages?.find((m) => {
            const md = (m as { metadata?: Partial<SlackMessageMetadata> })
              .metadata
            if (md?.event_payload == null) return false
            if (md.event_type !== eventType) return false
            return payloadMatcher(md.event_payload)
          })
          if (match?.ts === undefined) return null
          return { channel: channelId, ts: match.ts }
        }),
      )
    },
  }
}
