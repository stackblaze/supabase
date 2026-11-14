import { expect, test, type Page } from '@playwright/test'

import { env } from '../env.config.js'
import { toUrl } from '../utils/to-url.js'

/**
 * Self-hosted sign-in (STUDIO_SELF_HOSTED_LOGIN=true): pages redirect to sign-in, a successful
 * sign-in opens the requested page, and nothing loops. Runs only when the dashboard credentials
 * are given, e.g. against a deployed self-hosted Studio:
 *
 *   STUDIO_URL=https://… SELF_HOSTED_DASHBOARD_USERNAME=… SELF_HOSTED_DASHBOARD_PASSWORD=… \
 *     pnpm exec playwright test features/self-hosted-sign-in.spec.ts --no-deps
 */
const username = process.env.SELF_HOSTED_DASHBOARD_USERNAME
const password = process.env.SELF_HOSTED_DASHBOARD_PASSWORD

// Signed out: no stored session from the global setup.
test.use({ storageState: { cookies: [], origins: [] } })

/** Counts API and server-function requests, to tell a settled page from a reload loop. */
function countRequests(page: Page) {
  let count = 0
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.includes('/api/') || pathname.includes('/_serverFn')) count++
  })
  return () => count
}

async function signIn(page: Page) {
  // Typing before hydration would be lost; wait until the page is idle.
  await page.waitForLoadState('networkidle')
  await page.locator('input').first().fill(username!)
  await page.locator('input[type="password"]').fill(password!)
  await page.locator('button[type="submit"]').click()
}

test.describe('Self-hosted sign-in', () => {
  test.skip(
    env.IS_PLATFORM || !username || !password,
    'self-hosted sign-in only; needs SELF_HOSTED_DASHBOARD_USERNAME / _PASSWORD'
  )

  test('redirects a signed-out page to sign-in and back after signing in', async ({ page }) => {
    await page.goto(toUrl('/project/default/settings/general'))
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fproject%2Fdefault%2Fsettings%2Fgeneral/)

    await signIn(page)

    await expect(page).toHaveURL(/\/project\/default\/settings\/general$/, { timeout: 30_000 })
    // It stays there: nothing sends a freshly signed-in user back to sign-in.
    await page.waitForTimeout(5_000)
    await expect(page).toHaveURL(/\/project\/default\/settings\/general$/)
  })

  test('opens the default project when there is no returnTo', async ({ page }) => {
    await page.goto(toUrl('/'))
    await expect(page).toHaveURL(/\/sign-in$/)

    await signIn(page)

    await expect(page).toHaveURL(/\/project\/default$/, { timeout: 30_000 })
  })

  test('ignores a returnTo that leaves Studio', async ({ page }) => {
    await page.goto(toUrl('/sign-in?returnTo=%2F%2Fevil.example'))

    await signIn(page)

    await expect(page).toHaveURL(/\/project\/default$/, { timeout: 30_000 })
  })

  test('the signed-out sign-in page does not reload in a loop', async ({ page }) => {
    await page.goto(toUrl('/sign-in'))
    await page.waitForLoadState('networkidle')
    const requests = countRequests(page)

    await page.waitForTimeout(10_000)

    // A loop made about ten requests a second; a settled page makes a few retries at most.
    expect(requests()).toBeLessThan(20)
    await expect(page).toHaveURL(/\/sign-in$/)
  })

  test('signs out back to the sign-in page', async ({ page }) => {
    await page.goto(toUrl('/project/default'))
    await signIn(page)
    await expect(page).toHaveURL(/\/project\/default$/, { timeout: 30_000 })

    await page.goto(toUrl('/sign-out'))

    await expect(page).toHaveURL(/\/sign-in$/, { timeout: 30_000 })
    const session = await page.request.get(toUrl('/api/self-hosted/session'))
    expect(session.status()).toBe(401)
  })
})
