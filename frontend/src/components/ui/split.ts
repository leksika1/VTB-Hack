import type { User } from '../../types';

export function equalSplitInputs(members: User[]): Record<string, string> {
  if (!members.length) return {};
  const base = Math.floor(10_000 / members.length);
  const remainder = 10_000 % members.length;
  return Object.fromEntries(members.map((member, index) => [member.id, String((base + (index < remainder ? 1 : 0)) / 100)]));
}

export function splitSharesFromInputs(members: User[], values: Record<string, string>): Record<string, number> | null {
  const shares: Record<string, number> = {};
  for (const member of members) {
    const raw = values[member.id] ?? '';
    if (!/^\d{1,3}([.,]\d{1,2})?$/.test(raw)) return null;
    const points = Math.round(Number(raw.replace(',', '.')) * 100);
    if (points <= 0 || points > 10_000) return null;
    shares[member.id] = points;
  }
  return Object.values(shares).reduce((sum, value) => sum + value, 0) === 10_000 ? shares : null;
}

export function splitRemainingPercent(members: User[], values: Record<string, string>): number {
  const total = members.reduce((sum, member) => sum + (Number((values[member.id] ?? '').replace(',', '.')) || 0), 0);
  return Math.round((100 - total) * 100) / 100;
}
