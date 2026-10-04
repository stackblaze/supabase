import type { NextRouter } from 'next/router'

type BranchRef = { project_ref: string }

/**
 * Where a branch's merge page lives. Self-hosted on a hosting platform, every branch has
 * its own Studio (`studio_url`), and its merge page is served there.
 */
export const mergePageHref = (branch: BranchRef): string => {
  const studioUrl = (branch as BranchRef & { studio_url?: string }).studio_url
  return studioUrl ? `${studioUrl}/project/default/merge` : `/project/${branch.project_ref}/merge`
}

export const goToMergePage = (router: NextRouter, branch: BranchRef) => {
  const href = mergePageHref(branch)
  if (href.startsWith('http')) window.location.assign(href)
  else router.push(href)
}
