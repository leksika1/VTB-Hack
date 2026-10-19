import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../ui/Modal';
import { loadDemoData } from '../../utils/demoData';
import { Copy, Check, UserPlus, Sparkles, LogOut, Users, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

export function FamilySettingsModal() {
  const family = useFamilyStore((s) => s.family);
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  const switchUser = useFamilyStore((s) => s.switchUser);
  const leaveFamily = useFamilyStore((s) => s.leaveFamily);

  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const addToast = useUIStore((s) => s.addToast);

  const [copied, setCopied] = useState(false);

  if (!family) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      addToast('Код семьи скопирован!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Не удалось скопировать', 'error');
    }
  };

  const handleMemberClick = (memberId: string, memberName: string) => {
    // Only switch if multiple members and not currently active
    if (family.members.length > 1 && memberId !== currentUserId) {
      switchUser(memberId);
      addToast(`Переключено на: ${memberName}`);
    }
  };

  const isOpen = activeModal === 'familySettings';

  return (
    <Modal open={isOpen} onClose={closeModal} title="Управление семьёй">
      <div className="space-y-4">
        {/* Family info & code card */}
        <div className="p-4 rounded-2xl bg-[var(--color-bg-input)] border border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[rgba(184,255,51,0.1)] flex items-center justify-center text-[var(--color-lime)]">
                <Users size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">{family.name}</h3>
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {family.members.length === 1 ? '1 участник' : `${family.members.length} участника`}
                </p>
              </div>
            </div>
          </div>

          {/* Invite Code row */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]">
            <div>
              <span className="text-[9px] uppercase font-bold text-[var(--color-text-muted)] block">
                Код приглашения
              </span>
              <span className="text-sm font-mono font-extrabold text-[var(--color-lime)] tracking-wider">
                {family.inviteCode}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-[rgba(184,255,51,0.1)] text-[var(--color-lime)] hover:bg-[rgba(184,255,51,0.2)]
                text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              <span>{copied ? 'Скопировано' : 'Копировать код'}</span>
            </button>
          </div>
        </div>

        {/* Members list */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)] mb-2 block">
            Участники семьи {family.members.length > 1 && '(нажмите для переключения)'}
          </span>
          <div className="space-y-1.5">
            {family.members.map((m) => {
              const isCurrent = m.id === currentUserId;
              const isSwitchable = family.members.length > 1 && !isCurrent;
              return (
                <div
                  key={m.id}
                  onClick={() => isSwitchable && handleMemberClick(m.id, m.name)}
                  className={`p-3 rounded-xl border flex items-center justify-between transition-all
                    ${isCurrent
                      ? 'bg-[rgba(184,255,51,0.06)] border-[var(--color-border-focus)]'
                      : isSwitchable
                        ? 'bg-[var(--color-bg-input)] border-[var(--color-border)] hover:border-[var(--color-border-focus)] cursor-pointer'
                        : 'bg-[var(--color-bg-input)] border-[var(--color-border)]'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: `${m.color}22`, color: m.color }}
                    >
                      {m.name[0]}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[var(--color-text-primary)]">{m.name}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)]">
                        {isCurrent ? 'Текущий активный пользователь' : 'Нажмите, чтобы переключить'}
                      </p>
                    </div>
                  </div>

                  {isCurrent && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--color-lime)]">
                      <CheckCircle2 size={14} />
                      Активен
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Action list */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={() => openModal('invite')}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-bg-input)] border border-[var(--color-border)]
              text-xs font-semibold text-[var(--color-text-primary)] hover:border-[var(--color-border-focus)]
              hover:text-[var(--color-lime)] transition-colors flex items-center justify-center gap-2"
          >
            <UserPlus size={15} />
            <span>Поделиться ссылкой-приглашением</span>
          </button>

          <button
            type="button"
            onClick={() => {
              loadDemoData();
              closeModal();
              addToast('Демо-семья успешно загружена!');
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-bg-input)] border border-[rgba(184,255,51,0.2)]
              text-xs font-semibold text-[var(--color-lime)] hover:bg-[rgba(184,255,51,0.08)]
              transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={15} />
            <span>Загрузить демо-семью Смирновых</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm('Вы уверены, что хотите выйти из семьи?')) {
                leaveFamily();
                closeModal();
                addToast('Вы вышли из семьи', 'info');
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[var(--color-bg-input)] border border-transparent
              text-xs font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-dim)]
              transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={15} />
            <span>Выйти из семьи</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
