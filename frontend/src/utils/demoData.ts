import { useFamilyStore } from '../store/familyStore';
import { useBudgetStore } from '../store/budgetStore';
import { useExpensesStore } from '../store/expensesStore';
import { toMonthKey } from './date';
import type { Family, User, Expense } from '../types';

export function loadDemoData() {
  const currentMonth = toMonthKey();
  const yearMonth = currentMonth; // 'YYYY-MM'

  const userAlex: User = {
    id: 'user-alex',
    name: 'Алексей',
    avatarEmoji: '👨',
    color: '#33FFB8',
  };

  const userMaria: User = {
    id: 'user-maria',
    name: 'Мария',
    avatarEmoji: '👩',
    color: '#FFB833',
  };

  const demoFamily: Family = {
    id: 'family-demo',
    name: 'Семья Смирновых',
    inviteCode: 'SMIRN8',
    members: [userAlex, userMaria],
  };

  // Update family store
  useFamilyStore.setState((prev) => ({
    ...prev,
    family: demoFamily,
    currentUserId: userAlex.id,
    knownFamilies: {
      ...prev.knownFamilies,
      [demoFamily.inviteCode]: demoFamily,
    },
  }));

  // Set Budget: 135 000 ₽
  useBudgetStore.getState().setBudget(currentMonth, 135000, {
    food: 45000,
    housing: 40000,
    transport: 15000,
    kids: 20000,
    other: 15000,
  });

  // Sample expenses with realistic breakdown
  const demoExpenses: Expense[] = [
    {
      id: 'exp-1',
      familyId: demoFamily.id,
      title: 'Супермаркет «Перекрёсток»',
      amount: 4850,
      category: 'food',
      date: `${yearMonth}-15`,
      authorId: userAlex.id,
      authorName: userAlex.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
    },
    {
      id: 'exp-2',
      familyId: demoFamily.id,
      title: 'Аренда жилья / Коммуналка',
      amount: 38000,
      category: 'housing',
      date: `${yearMonth}-05`,
      authorId: userAlex.id,
      authorName: userAlex.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
    },
    {
      id: 'exp-3',
      familyId: demoFamily.id,
      title: 'Детская секция плавания',
      amount: 8500,
      category: 'kids',
      date: `${yearMonth}-08`,
      authorId: userMaria.id,
      authorName: userMaria.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 9,
    },
    {
      id: 'exp-4',
      familyId: demoFamily.id,
      title: 'Заправка авто Лукойл',
      amount: 3400,
      category: 'transport',
      date: `${yearMonth}-12`,
      authorId: userAlex.id,
      authorName: userAlex.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
    },
    {
      id: 'exp-5',
      familyId: demoFamily.id,
      title: 'Фрукты и фермерский сыр',
      amount: 2150,
      category: 'food',
      date: `${yearMonth}-16`,
      authorId: userMaria.id,
      authorName: userMaria.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    },
    {
      id: 'exp-6',
      familyId: demoFamily.id,
      title: 'Школьные учебники и канцтовары',
      amount: 4200,
      category: 'kids',
      date: `${yearMonth}-10`,
      authorId: userMaria.id,
      authorName: userMaria.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    },
    {
      id: 'exp-7',
      familyId: demoFamily.id,
      title: 'Подписка на сервисы и кино',
      amount: 1490,
      category: 'other',
      date: `${yearMonth}-02`,
      authorId: userAlex.id,
      authorName: userAlex.name,
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 16,
    },
  ];

  useExpensesStore.setState({ expenses: demoExpenses });
}
