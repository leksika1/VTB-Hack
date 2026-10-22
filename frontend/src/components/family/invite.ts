import type { Family } from '../../types';

/** The family name is part of the link so the invited person sees it before joining */
export function buildInviteUrl(family: Family): string {
  const params = new URLSearchParams({ invite: family.inviteCode, family: family.name });
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

export function readInviteFromUrl(): { code: string; familyName: string | null } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('invite');
  if (!code) return null;
  return { code: code.toUpperCase(), familyName: params.get('family') };
}

export function clearInviteFromUrl() {
  window.history.replaceState(null, '', window.location.pathname);
}
