import { budgetKey, useDataStore } from '../store/dataStore';
import { useFamilyStore } from '../store/familyStore';
import type { Expense, Family, MonthlyBudget, Payment, User } from '../types';
import { shiftMonth, toISODate, toMonthKey } from './date';
import { MEMBER_COLORS } from './id';

/** Day of the current month, clamped so demo data never lands in another month */
function dayOfMonth(offsetFromToday: number): string {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.min(Math.max(now.getDate() + offsetFromToday, 1), lastDay);
  return toISODate(new Date(now.getFullYear(), now.getMonth(), day));
}

export function loadDemoData() {
  const month = toMonthKey();
  const prevMonth = shiftMonth(month, -1);
  const now = Date.now();
  const hour = 3_600_000;

  const alex: User = { id: 'user-alex', name: 'Алексей', color: MEMBER_COLORS[0] };
  const maria: User = { id: 'user-maria', name: 'Мария', color: MEMBER_COLORS[1] };
  const family: Family = {
    id: 'family-demo',
    name: 'Семья Смирновых',
    inviteCode: 'SMRN26',
    members: [alex, maria],
    isDemo: true,
  };

  const plans = { food: 45000, housing: 46000, transport: 15000, kids: 20000, other: 9000 };
  const budgets: Record<string, MonthlyBudget> = {
    [budgetKey(family.id, month)]: { familyId: family.id, monthKey: month, totalAmount: 140000, categoryPlans: plans, updatedAt: now },
    [budgetKey(family.id, prevMonth)]: {
      familyId: family.id,
      monthKey: prevMonth,
      totalAmount: 135000,
      categoryPlans: { food: 45000, housing: 44000, transport: 15000, kids: 18000, other: 8000 },
      updatedAt: now - 30 * 24 * hour,
    },
  };

  const e = (
    id: string, title: string, amount: number, category: Expense['category'], date: string, author: User, ageHours: number, paymentId?: string
  ): Expense => ({
    id, familyId: family.id, title, amount, category, date, authorId: author.id, authorName: author.name, paymentId, createdAt: now - ageHours * hour,
  });

  const expenses: Expense[] = [
    e('exp-rent', 'Аренда квартиры', 38000, 'housing', `${month}-01`, alex, 400, 'pay-rent'),
    e('exp-sub', 'Онлайн-кинотеатр', 399, 'other', `${month}-02`, alex, 380),
    e('exp-swim', 'Секция плавания, абонемент', 8500, 'kids', dayOfMonth(-12), maria, 290),
    e('exp-books', 'Учебники и канцтовары', 4200, 'kids', dayOfMonth(-10), maria, 240),
    e('exp-fuel', 'Заправка', 3400, 'transport', dayOfMonth(-8), alex, 190),
    e('exp-market', 'Продукты на неделю', 6850.4, 'food', dayOfMonth(-6), alex, 140),
    e('exp-farm', 'Фрукты и сыр на рынке', 2150, 'food', dayOfMonth(-3), maria, 70),
    e('exp-pharmacy', 'Аптека', 1270.5, 'other', dayOfMonth(-1), maria, 20),
    e('exp-grocery', 'Супермаркет у дома', 3120, 'food', dayOfMonth(0), alex, 2),
    // previous month — for «как в прошлом месяце» in the budget form
    e('exp-prev-1', 'Продукты на месяц', 39800, 'food', `${prevMonth}-10`, alex, 900),
    e('exp-prev-2', 'Аренда квартиры', 38000, 'housing', `${prevMonth}-01`, alex, 1100),
    e('exp-prev-3', 'Коммунальные услуги', 6400, 'housing', `${prevMonth}-25`, maria, 700),
  ];

  const p = (
    id: string, title: string, amount: number, category: Payment['category'], dueDate: string, author: User, status: Payment['status'] = 'upcoming', expenseId?: string
  ): Payment => ({ id, familyId: family.id, title, amount, category, dueDate, status, expenseId, authorId: author.id, createdAt: now - 500 * hour });

  const payments: Payment[] = [
    p('pay-rent', 'Аренда квартиры', 38000, 'housing', `${month}-01`, alex, 'paid', 'exp-rent'),
    p('pay-utilities', 'Коммунальные услуги', 6500, 'housing', dayOfMonth(4), maria),
    p('pay-internet', 'Интернет и связь', 1800, 'other', dayOfMonth(2), alex),
    p('pay-kindergarten', 'Детский сад', 7500, 'kids', dayOfMonth(6), maria),
    p('pay-insurance', 'ОСАГО', 5200, 'transport', dayOfMonth(9), alex),
    p('pay-prev-rent', 'Аренда квартиры', 38000, 'housing', `${prevMonth}-01`, alex, 'paid', 'exp-prev-2'),
    p('pay-prev-utilities', 'Коммунальные услуги', 6400, 'housing', `${prevMonth}-25`, maria, 'paid', 'exp-prev-3'),
  ];

  useFamilyStore.setState({ family, currentUserId: alex.id });
  useDataStore.setState({ budgets, expenses, payments });
}
