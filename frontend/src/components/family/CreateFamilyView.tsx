import { useState, useEffect } from 'react';
import { Wallet, Sparkles, UserPlus, Users, ArrowRight } from 'lucide-react';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { loadDemoData } from '../../utils/demoData';

export function CreateFamilyView() {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [familyName, setFamilyName] = useState('');
  const [userName, setUserName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const createFamily = useFamilyStore((s) => s.createFamily);
  const joinByInviteCode = useFamilyStore((s) => s.joinByInviteCode);
  const findFamilyByCode = useFamilyStore((s) => s.findFamilyByCode);
  const addToast = useUIStore((s) => s.addToast);

  // Check URL query parameters for ?invite=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) {
      setInviteCode(code.toUpperCase());
      setTab('join');
    }
  }, []);

  const invitedFamily = inviteCode ? findFamilyByCode(inviteCode) : null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyName.trim() || !userName.trim()) return;
    createFamily(familyName.trim(), userName.trim());
    addToast(`Семья «${familyName.trim()}» создана!`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim() || !userName.trim()) return;
    joinByInviteCode(inviteCode.trim(), userName.trim());
    addToast('Вы успешно присоединились к семье!');
  };

  const handleDemo = () => {
    loadDemoData();
    addToast('Демо-данные загружены!');
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm animate-fade-in-scale">
        {/* Logo / Hero */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-3xl bg-[var(--color-lime)] flex items-center justify-center mb-4 shadow-[0_0_35px_var(--color-lime-glow)]">
            <Wallet size={32} className="text-[var(--color-text-inverse)]" />
          </div>
          <h1 className="text-2xl font-black text-[var(--color-text-primary)] mb-1 tracking-tight">Семейный Банкинг</h1>
          <p className="text-xs text-[var(--color-text-secondary)] text-center max-w-xs">
            Совместный учёт расходов, единый бюджет и финансовая прозрачность для вашей семьи
          </p>
        </div>

        {/* Tab switch: Create vs Join */}
        <div className="flex rounded-xl bg-[var(--color-bg-input)] p-1 border border-[var(--color-border)] mb-4">
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5
              ${tab === 'create'
                ? 'bg-[var(--color-lime)] text-[var(--color-text-inverse)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
          >
            <Users size={14} />
            Создать семью
          </button>
          <button
            type="button"
            onClick={() => setTab('join')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5
              ${tab === 'join'
                ? 'bg-[var(--color-lime)] text-[var(--color-text-inverse)] shadow-sm'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
              }`}
          >
            <UserPlus size={14} />
            Присоединиться
          </button>
        </div>

        {/* Forms */}
        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="glass-card p-5 space-y-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Ваше имя
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Алексей"
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                  border border-[var(--color-border)] text-[var(--color-text-primary)]
                  placeholder:text-[var(--color-text-muted)]
                  focus:outline-none focus:border-[var(--color-border-focus)]
                  transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Название семьи
              </label>
              <input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="Семья Смирновых"
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                  border border-[var(--color-border)] text-[var(--color-text-primary)]
                  placeholder:text-[var(--color-text-muted)]
                  focus:outline-none focus:border-[var(--color-border-focus)]
                  transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={!familyName.trim() || !userName.trim()}
              className="w-full py-3 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
                font-bold text-xs uppercase tracking-wider
                hover:brightness-110 active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-200
                shadow-[0_0_20px_var(--color-lime-glow)] flex items-center justify-center gap-2"
            >
              <span>Создать семью</span>
              <ArrowRight size={14} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="glass-card p-5 space-y-3.5">
            {invitedFamily && (
              <div className="p-3 rounded-xl bg-[rgba(184,255,51,0.08)] border border-[rgba(184,255,51,0.2)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Приглашение в семью:</p>
                <p className="text-sm font-bold text-[var(--color-lime)] mt-0.5">{invitedFamily.name}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                  Участники: {invitedFamily.members.map((m) => m.name).join(', ')}
                </p>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Код приглашения
              </label>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="ABC123XY"
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                  border border-[var(--color-border)] text-[var(--color-text-primary)] uppercase tracking-wider
                  placeholder:text-[var(--color-text-muted)] font-mono
                  focus:outline-none focus:border-[var(--color-border-focus)]
                  transition-colors text-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
                Ваше имя
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Мария"
                className="w-full px-3.5 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
                  border border-[var(--color-border)] text-[var(--color-text-primary)]
                  placeholder:text-[var(--color-text-muted)]
                  focus:outline-none focus:border-[var(--color-border-focus)]
                  transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={!inviteCode.trim() || !userName.trim()}
              className="w-full py-3 rounded-[var(--radius-button)] bg-[var(--color-lime)] text-[var(--color-text-inverse)]
                font-bold text-xs uppercase tracking-wider
                hover:brightness-110 active:scale-[0.98]
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-200
                shadow-[0_0_20px_var(--color-lime-glow)] flex items-center justify-center gap-2"
            >
              <span>Присоединиться</span>
              <ArrowRight size={14} />
            </button>
          </form>
        )}

        {/* Demo Fast-Track button */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleDemo}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-bg-card)] border border-[rgba(184,255,51,0.2)]
              text-[var(--color-lime)] text-xs font-semibold hover:bg-[rgba(184,255,51,0.08)]
              transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={14} />
            Загрузить демо-семью с расходами
          </button>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5">
            Моментальный доступ к готовому бюджету и тратам для оценки
          </p>
        </div>
      </div>
    </div>
  );
}
