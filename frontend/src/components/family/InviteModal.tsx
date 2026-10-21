import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { buildInviteUrl } from './invite';

export function InviteModal() {
  const family = useFamilyStore((s) => s.family);
  const closeModal = useUIStore((s) => s.closeModal);
  const addToast = useUIStore((s) => s.addToast);
  const [copied, setCopied] = useState(false);
  if (!family) return null;
  const url = buildInviteUrl(family);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      addToast('Ссылка-приглашение скопирована');
    } catch {
      addToast('Не удалось скопировать. Выделите ссылку и скопируйте вручную.', 'error');
    }
  };

  return (
    <Modal
      title="Пригласить в семью"
      description={`По ссылке партнёр увидит название «${family.name}» и сможет присоединиться.`}
      onClose={closeModal}
      footer={
        <Button fullWidth size="lg" icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
          {copied ? 'Скопировано' : 'Скопировать ссылку'}
        </Button>
      }
    >
      <div className="rounded-xl bg-surface-muted border border-line px-3.5 py-3 text-sm text-ink-2 break-all select-all">{url}</div>
      <p className="text-sm text-ink-3 mt-3">
        Или продиктуйте код: <span className="font-mono font-semibold text-ink tracking-wider">{family.inviteCode}</span>
      </p>
    </Modal>
  );
}
