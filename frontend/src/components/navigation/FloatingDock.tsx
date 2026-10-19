import { Home, Settings2, Plus, ReceiptText, Users } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

type Tab = 'home' | 'expenses';

interface FloatingDockProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function FloatingDock({ activeTab, onTabChange }: FloatingDockProps) {
  const openModal = useUIStore((s) => s.openModal);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-5 px-4 pointer-events-none">
      <nav className="pointer-events-auto flex items-center gap-1 px-4 py-2.5
        bg-[var(--color-bg-dock)] backdrop-blur-xl border border-[var(--color-border)]
        rounded-2xl shadow-[0_-4px_30px_rgba(0,0,0,0.4)]">

        <DockButton
          icon={<Home size={19} />}
          label="Главная"
          active={activeTab === 'home'}
          onClick={() => onTabChange('home')}
        />
        <DockButton
          icon={<ReceiptText size={19} />}
          label="Расходы"
          active={activeTab === 'expenses'}
          onClick={() => onTabChange('expenses')}
        />

        {/* FAB - Add Expense */}
        <button
          onClick={() => openModal('addExpense')}
          className="w-12 h-12 -mt-6 mx-2 rounded-2xl bg-[var(--color-lime)] text-[var(--color-text-inverse)]
            flex items-center justify-center shadow-[0_0_24px_var(--color-lime-glow)]
            hover:brightness-110 active:scale-[0.92] transition-all duration-200
            animate-pulse-glow"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>

        <DockButton
          icon={<Settings2 size={19} />}
          label="Бюджет"
          onClick={() => openModal('budgetConfig')}
        />
        <DockButton
          icon={<Users size={19} />}
          label="Семья"
          onClick={() => openModal('invite')}
        />
      </nav>
    </div>
  );
}

function DockButton({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors
        ${active
          ? 'text-[var(--color-lime)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
    >
      {icon}
      <span className="text-[9px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}
