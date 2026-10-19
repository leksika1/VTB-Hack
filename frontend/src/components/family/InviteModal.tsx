import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../ui/Modal';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

export function InviteModal() {
  const family = useFamilyStore((s) => s.family);
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);

  if (!family) return null;

  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${family.inviteCode}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      addToast('Ссылка скопирована!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Не удалось скопировать', 'error');
    }
  };

  return (
    <Modal open={activeModal === 'invite'} onClose={closeModal} title="Пригласить в семью">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Поделитесь ссылкой с партнёром или членом семьи, чтобы вести бюджет вместе.
        </p>

        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2.5 rounded-[var(--radius-input)] bg-[var(--color-bg-input)]
            border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] truncate select-all">
            {inviteUrl}
          </div>
          <button
            onClick={handleCopy}
            className={`shrink-0 w-10 h-10 rounded-[var(--radius-input)] flex items-center justify-center
              transition-all duration-200
              ${copied
                ? 'bg-[var(--color-success)] text-[var(--color-text-inverse)]'
                : 'bg-[var(--color-lime)] text-[var(--color-text-inverse)] hover:brightness-110'
              }`}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <div className="pt-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            Участники семьи: {family.members.map((m) => m.name).join(', ')}
          </p>
        </div>
      </div>
    </Modal>
  );
}
