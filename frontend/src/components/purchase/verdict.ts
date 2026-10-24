import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';

/** Verdict look, shared with purchase requests that carry the server's check */
export const VERDICT = {
  ok: { icon: CircleCheck, tone: 'bg-success-soft text-success', title: 'Покупка помещается в план' },
  tight: { icon: TriangleAlert, tone: 'bg-warning-soft text-warning', title: 'Хватает, но запас будет маленьким' },
  'category-over': { icon: TriangleAlert, tone: 'bg-warning-soft text-warning', title: 'В бюджет помещается, но категория выйдет за лимит' },
  'not-enough': { icon: CircleAlert, tone: 'bg-danger-soft text-danger', title: 'Не хватает с учётом обязательных платежей' },
} as const;
