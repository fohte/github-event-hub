# github-event-hub

@fohte's personal hub that receives GitHub webhooks from repositories in the `fohte` org and forwards a curated subset to Slack (`#infra_alert`).

[![Test](https://github.com/fohte/github-event-hub/actions/workflows/test.yml/badge.svg)](https://github.com/fohte/github-event-hub/actions/workflows/test.yml)

## Features

Only the following events are forwarded to Slack; everything else is acknowledged with `200` and dropped.

- **CI failures on the default branch** — `workflow_run` events where `action=completed`, `conclusion=failure`, and the head branch matches the repository's default branch. Fork-originated runs are excluded.
- **Renovate security PRs** — `pull_request` events where `action=opened` and either the title ends with `[security]` or the head branch matches `renovate/*-vulnerability`.

## Endpoints

| Method | Path       | Description                                                                                                                                                  |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/github`  | GitHub webhook receiver. Verifies `x-hub-signature-256`; rejects invalid signatures with `401`. Handler errors return `200` to suppress GitHub's redelivery. |
| `GET`  | `/healthz` | Liveness probe; returns `ok`.                                                                                                                                |

## Configuration

| Variable                | Required | Default        | Description                                    |
| ----------------------- | -------- | -------------- | ---------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | Yes      | —              | Shared secret for HMAC signature verification. |
| `SLACK_BOT_TOKEN`       | Yes      | —              | Slack bot token with `chat:write` scope.       |
| `SLACK_CHANNEL`         | No       | `#infra_alert` | Channel to post notifications to.              |
| `PORT`                  | No       | `8080`         | HTTP listen port.                              |

## Development

Prerequisites: Node.js 24 (managed via [mise](https://mise.jdx.dev/)), pnpm 11.

```bash
pnpm install
pnpm dev    # tsx watch src/index.ts
pnpm test   # type-check + vitest
pnpm build  # emit dist/
pnpm start  # node dist/index.js
```

## Deployment

The container image is published to `ghcr.io/fohte/github-event-hub` and deployed via a self-hosted Helm chart in the `infra` repository (`kubernetes/home/manifests/github-event-hub/`). Argo CD Image Updater pins the running tag to the latest digest. The service is exposed at `github-event-hub.fohte.net` through Cloudflare Tunnel.

See [docs/architecture.md](docs/architecture.md) for the full deployment and request-flow details.

## Architecture

See [docs/architecture.md](docs/architecture.md).
