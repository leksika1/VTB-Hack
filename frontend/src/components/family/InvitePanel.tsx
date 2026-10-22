import { useState } from 'react';
import { Check, Copy, Link2, Share2 } from 'lucide-react';
import type { Role } from '../../types';
import { createInviteLink } from '../../api/client';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { useFamilyStore } from '../../store/familyStore';
import { useUIStore } from '../../store/uiStore';
import { formatDateShort, toISODate } from '../../utils/date';
import { Button } from '../ui/Button';
import { FormError } from '../ui/Field';
import { buildInviteUrl } from './invite';

const ROLES: { value: Role; label: string }[] = [
  { value: 'parent', label: 'Взрослого' },
  { value: 'child', label: 'Ребёнка' },
];

/**
 * Invite for adults: a link (joins at once, valid 7 days) and the permanent codes (join after approval).
 * The link code is returned by the server only once, so the created link is kept for this tab.
 */
export function InvitePanel() {
  const family = useFamilyStore((s) => s.family);
  const addToast = useUIStore((s) => s.addToast);
  const links = useUIStore((s) => s.inviteLinks);
  const rememberInviteLink = useUIStore((s) => s.rememberInviteLink);
  const create = useAsyncAction(createInviteLink);
  const [role, setRole] = useState<Role>('parent');
  const [copied, setCopied] = useState(false);
  if (!family) return null;

  // Kept only for this tab, so it cannot outlive its 7 days unnoticed
  const link = links[`${family.id}:${role}`] ?? null;
  const code = role === 'parent' ? family.inviteCode : family.childInviteCode;

  const onCreate = async () => {
    const res = await create.run(role);
    if (!res.ok || !res.value.code) return;
    rememberInviteLink(family.id, role, { url: buildInviteUrl(res.value.code), expiresAt: res.value.expiresAt });
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      addToast('Ссылка-приглашение скопирована');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Не удалось скопировать. Выделите ссылку и скопируйте вручную.', 'error');
    }
  };

  const share = async (url: string) => {
    try {
      await navigator.share({ title: `Приглашение в «${family.name}»`, url });
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div>
      <div role="radiogroup" aria-label="Кого приглашаете" className="grid grid-cols-2 gap-1 p-1 rounded-[var(--radius-control)] bg-surface-sunken">
        {ROLES.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={role === r.value}
            onClick={() => {
              setRole(r.value);
              create.reset();
            }}
            className={`h-10 rounded-[10px] text-sm font-medium transition-colors
              ${role === r.value ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:text-ink'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {link ? (
        <>
          <div className="mt-3 rounded-xl bg-surface-muted border border-line px-3.5 py-3 text-sm text-ink-2 break-all select-all">{link.url}</div>
          <div className="flex flex-wrap items-center gap-2.5 mt-3">
            <Button icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => copy(link.url)}>
              {copied ? 'Скопировано' : 'Скопировать ссылку'}
            </Button>
            {typeof navigator.share === 'function' && (
              <Button variant="secondary" icon={<Share2 size={16} />} onClick={() => share(link.url)}>
                Поделиться
              </Button>
            )}
          </div>
          <p className="text-[13px] text-ink-3 mt-2">
            По ссылке входят сразу, без подтверждения. Действует до {formatDateShort(toISODate(new Date(link.expiresAt)))}.
            Сохраните её сейчас — после перезагрузки страницы ссылку покажем только новую.
          </p>
        </>
      ) : (
        <>
          <Button className="mt-3" icon={<Link2 size={16} />} loading={create.pending} onClick={onCreate}>
            Создать ссылку-приглашение
          </Button>
          <p className="text-[13px] text-ink-3 mt-2">
            {role === 'parent'
              ? 'Взрослый участник увидит общий бюджет, расходы и платежи.'
              : 'Ребёнок увидит только свои расходы, карманные деньги и запросы.'}{' '}
            Ссылка действует 7 дней.
          </p>
        </>
      )}
      {create.error && <FormError>{create.error}</FormError>}

      {code && (
        <p className="text-sm text-ink-3 mt-4 pt-4 border-t border-line">
          {role === 'parent' ? 'Код семьи' : 'Детский код'}:{' '}
          <span className="font-mono font-semibold text-ink tracking-wider">{code}</span>
          <span className="block text-[13px] mt-0.5">Вошедший по коду увидит данные семьи после вашего подтверждения.</span>
        </p>
      )}
    </div>
  );
}
