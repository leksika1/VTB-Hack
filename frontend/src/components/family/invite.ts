/**
 * Invite link: https://<domain>/?invite=<code>. The code is a family code, a child code (6 characters)
 * or an invite link code (16). The family name is not in the link: the invite screen asks the server (GET /invites/{code}).
 */
export function buildInviteUrl(code: string): string {
  return `${window.location.origin}/?${new URLSearchParams({ invite: code }).toString()}`;
}

export function readInviteFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('invite');
  return code ? code.trim().toUpperCase() : null;
}

export function clearInviteFromUrl() {
  window.history.replaceState(null, '', '/');
}
