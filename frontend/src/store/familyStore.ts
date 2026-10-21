import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Family, User } from '../types';

interface FamilyState {
  family: Family | null;
  currentUserId: string | null;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (): FamilyState => ({
      family: null,
      currentUserId: null,
    }),
    { name: 'fb-family-v2' }
  )
);

export function useCurrentUser(): User | null {
  return useFamilyStore((s) => s.family?.members.find((m) => m.id === s.currentUserId) ?? null);
}

/** Display name of the record author, tolerant to old data without an author */
export function resolveAuthorName(family: Family | null, authorId: string | null, fallback?: string): string {
  const member = authorId ? family?.members.find((m) => m.id === authorId) : undefined;
  return member?.name ?? fallback ?? 'Автор не указан';
}
