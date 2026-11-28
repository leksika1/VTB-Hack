import { ErrorIcon, Accept, WarningIcon } from '../ui/icons';

/** Visual state for the server-side purchase affordability check. */
export const VERDICT = {
  ok: { icon: Accept, tone: 'bg-success-soft text-success', title: 'Покупка помещается в план' },
  tight: { icon: WarningIcon, tone: 'bg-warning-soft text-warning', title: 'Хватает, но запас будет маленьким' },
  'category-over': { icon: WarningIcon, tone: 'bg-warning-soft text-warning', title: 'В бюджет помещается, но категория выйдет за лимит' },
  'not-enough': { icon: ErrorIcon, tone: 'bg-danger-soft text-danger', title: 'Не хватает с учётом обязательных платежей' },
} as const;
