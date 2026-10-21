export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

/** Muted, distinguishable avatar colours that work on light and dark backgrounds */
export const MEMBER_COLORS = ['#1F5BD8', '#C2410C', '#0F766E', '#7C3AED', '#BE185D', '#4D7C0F'];
