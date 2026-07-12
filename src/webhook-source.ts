import type { SlackNotifier } from '@/slack'

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
