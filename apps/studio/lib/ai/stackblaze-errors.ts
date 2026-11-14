/**
 * Out of AI credits on the StackBlaze platform: the AI proxy's message plus this sentence with
 * the dashboard's billing link. Shared by the server (which adds it) and the Assistant (which
 * turns the link into an "Add credits" button). Client-safe: no server imports.
 */
const CREDITS_PREFIX = 'Add credits on the StackBlaze dashboard: '

export function withBillingLink(message: string, dashboardUrl: string): string {
  return `${message} ${CREDITS_PREFIX}${dashboardUrl.replace(/\/+$/, '')}/billing`
}

export function billingUrlFromAiError(message: string | undefined): string | undefined {
  if (!message) return
  const at = message.lastIndexOf(CREDITS_PREFIX)
  if (at < 0) return
  const url = message
    .slice(at + CREDITS_PREFIX.length)
    .trim()
    .split(/\s/)[0]
  return /^https?:\/\/[^\s]+\/billing$/.test(url) ? url : undefined
}
