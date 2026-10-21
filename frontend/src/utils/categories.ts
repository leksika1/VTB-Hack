import {
  ShoppingCart,
  House,
  Car,
  Baby,
  Ellipsis,
  type LucideIcon,
} from 'lucide-react';
import type { ExpenseCategory } from '../types';

export interface CategoryConfig {
  key: ExpenseCategory;
  label: string;
  icon: LucideIcon;
  /** CSS variable for the category hue (chart marks, swatches) */
  color: string;
  /** Deeper step of the same hue, readable as an icon on the soft background */
  inkColor: string;
  /** CSS variable for the soft background behind the icon */
  softColor: string;
}

export const CATEGORIES: Record<ExpenseCategory, CategoryConfig> = {
  food: {
    key: 'food',
    label: 'Продукты',
    icon: ShoppingCart,
    color: 'var(--cat-food)',
    inkColor: 'var(--cat-food-ink)',
    softColor: 'var(--cat-food-soft)',
  },
  housing: {
    key: 'housing',
    label: 'Жильё',
    icon: House,
    color: 'var(--cat-housing)',
    inkColor: 'var(--cat-housing-ink)',
    softColor: 'var(--cat-housing-soft)',
  },
  transport: {
    key: 'transport',
    label: 'Транспорт',
    icon: Car,
    color: 'var(--cat-transport)',
    inkColor: 'var(--cat-transport-ink)',
    softColor: 'var(--cat-transport-soft)',
  },
  kids: {
    key: 'kids',
    label: 'Дети',
    icon: Baby,
    color: 'var(--cat-kids)',
    inkColor: 'var(--cat-kids-ink)',
    softColor: 'var(--cat-kids-soft)',
  },
  other: {
    key: 'other',
    label: 'Другое',
    icon: Ellipsis,
    color: 'var(--cat-other)',
    inkColor: 'var(--cat-other-ink)',
    softColor: 'var(--cat-other-soft)',
  },
};

export const ALL_CATEGORIES: ExpenseCategory[] = ['food', 'housing', 'transport', 'kids', 'other'];

export function emptyCategoryRecord(): Record<ExpenseCategory, number> {
  return { food: 0, housing: 0, transport: 0, kids: 0, other: 0 };
}
