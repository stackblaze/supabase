import type { NextApiRequest } from 'next'

export const MIN_PASSWORD_LENGTH = 8

/** The request came in over TLS at the gateway. */
export const isSecureRequest = (req: NextApiRequest) =>
  String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim() === 'https'

/** Where email links should bring people back: the public URL Studio is served at. */
export function publicUrl(req: NextApiRequest): string {
  const configured = process.env.SUPABASE_PUBLIC_URL?.replace(/\/+$/, '')
  if (configured) return configured
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:3000')
    .split(',')[0]
    .trim()
  return `${isSecureRequest(req) ? 'https' : 'http'}://${host}`
}

export const isEmail = (value: unknown): value is string =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
