import type { CategorySummary } from '../../domain/budget';
import { formatCurrency } from '../../utils/currency';

export type StatusTone = 'neutral' | 'warning' | 'danger';

/** Category state in words + amount, so it never relies on colour alone */
export function describeCategory(c: CategorySummary): { text: string; tone: StatusTone } {
  switch (c.status) {
    case 'no-limit':
      return c.spent + c.reserved > 0
        ? { text: `Лимит не задан, потрачено ${formatCurrency(c.spent)}`, tone: 'warning' }
        : { text: 'Лимит не задан', tone: 'neutral' };
    case 'no-spend':
      return { text: `Расходов нет, доступно ${formatCurrency(c.plan)}`, tone: 'neutral' };
    case 'ok':
      return { text: `Осталось ${formatCurrency(c.left)}`, tone: 'neutral' };
    case 'near':
      return { text: `Почти исчерпан, осталось ${formatCurrency(c.left)}`, tone: 'warning' };
    case 'over':
      return c.overByExpenses
        ? { text: `Превышен на ${formatCurrency(c.spent - c.plan)}`, tone: 'danger' }
        : { text: `Не хватит ${formatCurrency(-c.left)} на предстоящие платежи`, tone: 'danger' };
  }
}

export const TONE_TEXT: Record<StatusTone, string> = {
  neutral: 'text-ink-2',
  warning: 'text-warning',
  danger: 'text-danger',
};
