import type { Hono } from 'hono'

// Bundles status and body into one value so each test can assert the whole
// response with a single equality check.
export const requestJson = async (
  app: Hono,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown }> => {
  const res = await app.request(path, init)
  return { status: res.status, body: await res.json() }
}

export const requestText = async (
  app: Hono,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: string }> => {
  const res = await app.request(path, init)
  return { status: res.status, body: await res.text() }
}
