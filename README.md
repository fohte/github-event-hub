# github-event-hub

@fohte's personal hub that receives GitHub webhooks and forwards a curated subset to a configurable Slack channel.

[![Test](https://github.com/fohte/github-event-hub/actions/workflows/test.yml/badge.svg)](https://github.com/fohte/github-event-hub/actions/workflows/test.yml)
[![ghcr.io](https://img.shields.io/badge/ghcr.io-fohte%2Fgithub--event--hub-blue?logo=github)](https://github.com/fohte/github-event-hub/pkgs/container/github-event-hub)

## Features

Only the following events are forwarded to Slack; everything else is acknowledged with `200` and dropped.

- **CI failures on the default branch** — `workflow_run` events where `action=completed`, `conclusion=failure`, and the head branch matches the repository's default branch. Fork-originated runs are excluded.
- **Renovate security PRs** — `pull_request` events where either the title ends with `[security]` or the head branch matches `renovate/*-vulnerability`. The original `opened` notification is edited in place on `closed`: green border while open, purple when merged, red when closed without merging.

## Endpoints

| Method | Path       | Description                                                                                                                                                  |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/github`  | GitHub webhook receiver. Verifies `x-hub-signature-256`; rejects invalid signatures with `401`. Handler errors return `200` to suppress GitHub's redelivery. |
| `GET`  | `/healthz` | Liveness probe; returns `ok`.                                                                                                                                |

## Configuration

| Variable                | Required | Default        | Description                                                       |
| ----------------------- | -------- | -------------- | ----------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | Yes      | —              | Shared secret for HMAC signature verification.                    |
| `SLACK_BOT_TOKEN`       | Yes      | —              | Slack bot token. Required scopes are listed in the Setup section. |
| `SLACK_CHANNEL`         | No       | `#infra_alert` | Slack channel ID or name to post to.                              |
| `PORT`                  | No       | `8080`         | HTTP listen port.                                                 |

## Setup

To run the service against real GitHub deliveries, three things need to be wired up.

1. **Run the container.** The published image listens on `8080`:

   ```bash
   docker run --rm -p 8080:8080 \
     -e GITHUB_WEBHOOK_SECRET=... \
     -e SLACK_BOT_TOKEN=xoxb-... \
     -e SLACK_CHANNEL=#your-channel \
     ghcr.io/fohte/github-event-hub:latest
   ```

   Expose the container behind HTTPS at a URL GitHub can reach.

2. **Register the webhook on each source repository** (Settings → Webhooks):
   - Payload URL: `https://<your-host>/github`
   - Content type: `application/json`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET`
   - Events: `Workflow runs` and `Pull requests` (or `Send me everything` — non-matching events are ignored)

3. **Create the Slack bot.** Grant the following scopes, install it to the workspace, and invite it into the target channel. Use the bot token (`xoxb-...`) for `SLACK_BOT_TOKEN`.
   - `chat:write` — post and edit messages
   - `channels:history` (public channel) or `groups:history` (private channel) — look up the original PR message to edit on close
   - `metadata.message:read` — read the embedded PR identifier on history items
   - `channels:read` and/or `groups:read` — resolve `SLACK_CHANNEL` name (`#foo`) to a channel ID

## Development

Prerequisites: Node.js 24 (managed via [mise](https://mise.jdx.dev/)), pnpm 11.

```bash
pnpm install
pnpm dev    # tsx watch src/index.ts
pnpm test   # type-check + vitest
pnpm build  # emit dist/
pnpm start  # node dist/index.js
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the request flow and notification rules.
