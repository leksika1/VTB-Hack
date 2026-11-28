import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Family, User } from '../types';

export interface SavedSession {
  family: Family;
  currentUserId: string | null;
  token: string;
  unreadNotifications: number;
}

interface FamilyState {
  family: Family | null;
  currentUserId: string | null;
  /** Session token from the backend, sent as Authorization: Bearer */
  token: string | null;
  /** Unread in-app notifications returned with GET /state. */
  unreadNotifications: number;
  /** The real account put aside while the demo copy is open: leaving the demo brings it back */
  savedSession: SavedSession | null;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (): FamilyState => ({
      family: null,
      currentUserId: null,
      token: null,
      unreadNotifications: 0,
      savedSession: null,
    }),
    // v3: data lives on the backend now; v2 held the local mock data
    { name: 'fb-family-v3' }
  )
);

export function useCurrentUser(): User | null {
  return useFamilyStore((s) => s.family?.members.find((m) => m.id === s.currentUserId) ?? null);
}

/** Display name of the record author, tolerant to old data without an author */
export function resolveAuthorName(family: Family | null, authorId: string | null, fallback?: string | null): string {
  const member = authorId ? family?.members.find((m) => m.id === authorId) : undefined;
  return member?.name ?? fallback ?? 'Автор не указан';
}
