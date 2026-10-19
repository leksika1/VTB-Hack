import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { Users, Link2, Settings } from 'lucide-react';

export function FamilyHeader() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const switchUser = useFamilyStore((s) => s.switchUser);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);

  if (!family) return null;

  const currentUser = family.members.find((m) => m.id === currentUserId) || family.members[0];
  const hasMultipleMembers = family.members.length > 1;

  const handleAvatarClick = (memberId: string, memberName: string) => {
    // When only 1 user, do nothing (no toast)
    if (!hasMultipleMembers) return;
    // When clicking the already active user, do nothing
    if (memberId === currentUserId) return;

    switchUser(memberId);
    addToast(`Переключено на: ${memberName}`);
  };

  return (
    <header className="flex items-center justify-between px-1 mb-5">
      {/* Left: family name & current user badge (clickable to open family settings) */}
      <button
        type="button"
        onClick={() => openModal('familySettings')}
        className="flex items-center gap-3 min-w-0 text-left group hover:opacity-90 transition-opacity cursor-pointer"
        title="Настройки семьи"
      >
        <div className="w-10 h-10 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)]
          group-hover:border-[var(--color-border-focus)] flex items-center justify-center shrink-0 shadow-sm transition-colors">
          <Users size={18} className="text-[var(--color-lime)]" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold text-[var(--color-text-primary)] truncate">
              {family.name}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-[var(--color-text-muted)]">Вы:</span>
            {currentUser && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.2 rounded-md"
                style={{ backgroundColor: `${currentUser.color}22`, color: currentUser.color }}
              >
                <span>{currentUser.name}</span>
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Right: actions & member switch */}
      <div className="flex items-center gap-2">
        {/* Avatars: if 1 user -> static clean avatar, if multiple -> switchable pills */}
        {hasMultipleMembers ? (
          <div className="flex items-center gap-1 bg-[var(--color-bg-card)] p-1 rounded-xl border border-[var(--color-border)]">
            {family.members.map((m) => {
              const active = m.id === currentUserId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleAvatarClick(m.id, m.name)}
                  title={active ? `${m.name} (текущий)` : `Переключиться на: ${m.name}`}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all cursor-pointer
                    ${active
                      ? 'scale-105 shadow-[0_0_10px_var(--color-lime-glow)] border-2 border-[var(--color-lime)]'
                      : 'opacity-50 hover:opacity-100 border border-transparent'
                    }`}
                  style={{ backgroundColor: `${m.color}22`, color: m.color }}
                >
                  {m.name[0]}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold border border-[var(--color-border)]"
            style={{ backgroundColor: `${currentUser.color}22`, color: currentUser.color }}
            title={currentUser.name}
          >
            {currentUser.name[0]}
          </div>
        )}

        {/* Invite link button */}
        <button
          type="button"
          onClick={() => openModal('invite')}
          className="w-8 h-8 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]
            flex items-center justify-center text-[var(--color-text-secondary)]
            hover:text-[var(--color-lime)] hover:border-[var(--color-border-focus)]
            transition-colors cursor-pointer"
          title="Пригласить участника"
        >
          <Link2 size={15} />
        </button>

        {/* Family Settings Modal Trigger */}
        <button
          type="button"
          onClick={() => openModal('familySettings')}
          className="w-8 h-8 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]
            flex items-center justify-center text-[var(--color-text-secondary)]
            hover:text-[var(--color-lime)] hover:border-[var(--color-border-focus)]
            transition-colors cursor-pointer"
          title="Управление семьёй"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
