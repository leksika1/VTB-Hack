import {
  ShoppingCart,
  Home,
  Car,
  Baby,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { ExpenseCategory } from '../types';

export interface CategoryConfig {
  key: ExpenseCategory;
  label: string;
  icon: LucideIcon;
  color: string;
  bgClass: string;
}

export const CATEGORIES: Record<ExpenseCategory, CategoryConfig> = {
  food: {
    key: 'food',
    label: 'Продукты',
    icon: ShoppingCart,
    color: 'var(--color-cat-food)',
    bgClass: 'bg-[rgba(51,255,184,0.12)]',
  },
  housing: {
    key: 'housing',
    label: 'Жильё',
    icon: Home,
    color: 'var(--color-cat-housing)',
    bgClass: 'bg-[rgba(51,138,255,0.12)]',
  },
  transport: {
    key: 'transport',
    label: 'Транспорт',
    icon: Car,
    color: 'var(--color-cat-transport)',
    bgClass: 'bg-[rgba(255,184,51,0.12)]',
  },
  kids: {
    key: 'kids',
    label: 'Дети',
    icon: Baby,
    color: 'var(--color-cat-kids)',
    bgClass: 'bg-[rgba(255,83,83,0.12)]',
  },
  other: {
    key: 'other',
    label: 'Другое',
    icon: MoreHorizontal,
    color: 'var(--color-cat-other)',
    bgClass: 'bg-[rgba(184,51,255,0.12)]',
  },
};

export const ALL_CATEGORIES: ExpenseCategory[] = ['food', 'housing', 'transport', 'kids', 'other'];
