import type { SlackNotifier } from '@/slack'

// Duplicated from dispatch.ts rather than imported: dispatch.ts holds
// GitHub-specific logic destined for sources/github, while this contract
// lives in core and must not depend on any specific source.
export type DispatchOutcome = 'notified' | 'filtered' | 'ignored'

export interface WebhookHeaders {
  get(name: string): string | null
}

export interface SourceContext {
  deliveryId: string
  eventName: string
}

export interface WebhookSource {
  readonly name: string
  readonly path: string
  /** A null result short-circuits `verify`/`dispatch` for this request. */
  extractContext(headers: WebhookHeaders): SourceContext | null
  verify(
    rawBody: string,
    headers: WebhookHeaders,
    context: SourceContext,
  ): Promise<boolean> | boolean
  dispatch(
    context: SourceContext,
    payload: unknown,
    notifier: SlackNotifier,
  ): Promise<DispatchOutcome>
}

/** Paths across sources must be unique; this is a precondition, not validated here. */
export type WebhookSourceRegistry = readonly WebhookSource[]

export type WebhookSourceRunResult =
  | { status: 'unrecognized' }
  | { status: 'unauthorized' }
  | { status: 'dispatched'; context: SourceContext; outcome: DispatchOutcome }

export const runWebhookSource = async (
  source: WebhookSource,
  rawBody: string,
  headers: WebhookHeaders,
  payload: unknown,
  notifier: SlackNotifier,
): Promise<WebhookSourceRunResult> => {
  const context = source.extractContext(headers)
  if (context === null) return { status: 'unrecognized' }

  const verified = await source.verify(rawBody, headers, context)
  if (!verified) return { status: 'unauthorized' }

  const outcome = await source.dispatch(context, payload, notifier)
  return { status: 'dispatched', context, outcome }
}
