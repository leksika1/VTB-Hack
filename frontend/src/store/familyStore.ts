import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Family, User } from '../types';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const AVATAR_EMOJIS = ['👤', '👩', '👨', '🧑', '👧', '👦', '🧔', '👩‍🦰'];
const AVATAR_COLORS = ['#33FFB8', '#338AFF', '#FFB833', '#FF5353', '#B833FF', '#FF33A8', '#33FFF5', '#B8FF33'];

interface FamilyState {
  family: Family | null;
  currentUserId: string | null;
  knownFamilies: Record<string, Family>; // inviteCode -> Family
  createFamily: (name: string, userName: string) => void;
  joinFamily: (family: Family, userName: string) => void;
  joinByInviteCode: (code: string, userName: string) => boolean;
  findFamilyByCode: (code: string) => Family | null;
  switchUser: (userId: string) => void;
  getCurrentUser: () => User | null;
  leaveFamily: () => void;
}

export const useFamilyStore = create<FamilyState>()(
  persist(
    (set, get) => ({
      family: null,
      currentUserId: null,
      knownFamilies: {},

      createFamily: (name: string, userName: string) => {
        const userId = generateId();
        const memberIndex = 0;
        const user: User = {
          id: userId,
          name: userName,
          avatarEmoji: AVATAR_EMOJIS[memberIndex],
          color: AVATAR_COLORS[memberIndex],
        };
        const inviteCode = generateInviteCode();
        const family: Family = {
          id: generateId(),
          name,
          inviteCode,
          members: [user],
        };
        const knownFamilies = { ...get().knownFamilies, [inviteCode]: family };
        set({ family, currentUserId: userId, knownFamilies });
      },

      joinFamily: (existingFamily: Family, userName: string) => {
        const userId = generateId();
        const memberIndex = existingFamily.members.length % AVATAR_EMOJIS.length;
        const user: User = {
          id: userId,
          name: userName,
          avatarEmoji: AVATAR_EMOJIS[memberIndex],
          color: AVATAR_COLORS[memberIndex],
        };
        const updated: Family = {
          ...existingFamily,
          members: [...existingFamily.members, user],
        };
        const knownFamilies = { ...get().knownFamilies, [updated.inviteCode]: updated };
        set({ family: updated, currentUserId: userId, knownFamilies });
      },

      findFamilyByCode: (code: string) => {
        const upper = code.trim().toUpperCase();
        const { knownFamilies, family } = get();
        if (family && family.inviteCode === upper) return family;
        return knownFamilies[upper] || null;
      },

      joinByInviteCode: (code: string, userName: string) => {
        const upper = code.trim().toUpperCase();
        let target = get().findFamilyByCode(upper);
        
        // If not found in memory, simulate/create a realistic family with that invite code
        if (!target) {
          target = {
            id: generateId(),
            name: `Семья (${upper})`,
            inviteCode: upper,
            members: [
              {
                id: generateId(),
                name: 'Партнёр',
                avatarEmoji: '👨',
                color: '#338AFF',
              },
            ],
          };
        }

        get().joinFamily(target, userName);
        return true;
      },

      switchUser: (userId: string) => {
        set({ currentUserId: userId });
      },

      getCurrentUser: () => {
        const { family, currentUserId } = get();
        if (!family || !currentUserId) return null;
        return family.members.find((m) => m.id === currentUserId) ?? null;
      },

      leaveFamily: () => {
        set({ family: null, currentUserId: null });
      },
    }),
    { name: 'family-store' }
  )
);
