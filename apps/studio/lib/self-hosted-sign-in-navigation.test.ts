import { describe, expect, it } from 'vitest'

import { safeReturnTo, SIGNED_IN_HOME } from './self-hosted-sign-in-navigation'

describe('safeReturnTo', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(safeReturnTo('/project/default/editor?x=1#t')).toBe('/project/default/editor?x=1#t')
  })

  it('falls back to the default project', () => {
    for (const value of [undefined, '', 'project/default', ['/a'], 42]) {
      expect(safeReturnTo(value)).toBe(SIGNED_IN_HOME)
    }
  })

  it('refuses other origins', () => {
    for (const value of ['//evil.example', '/\\evil.example', 'https://evil.example/x']) {
      expect(safeReturnTo(value)).toBe(SIGNED_IN_HOME)
    }
  })

  it('does not send people back to the sign-in pages', () => {
    for (const value of ['/sign-in', '/sign-in?returnTo=%2F', '/sign-out', '/reset-password']) {
      expect(safeReturnTo(value)).toBe(SIGNED_IN_HOME)
    }
  })
})
