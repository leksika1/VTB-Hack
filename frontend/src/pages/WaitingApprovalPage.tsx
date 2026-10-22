import { useState } from 'react';
import { Hourglass, LogOut, RefreshCw } from 'lucide-react';
import { leaveFamily, reloadState } from '../api/client';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { useCurrentUser, useFamilyStore } from '../store/familyStore';
import { useUIStore } from '../store/uiStore';
import { BrandMark } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormError } from '../components/ui/Field';
import { Presence } from '../components/ui/Presence';

/**
 * Joined by a family or child code: until an adult approves, the family data is hidden (family.pending).
 * The event stream tells us about the approval, and the app opens by itself.
 */
export function WaitingApprovalPage() {
  const family = useFamilyStore((s) => s.family);
  const user = useCurrentUser();
  const addToast = useUIStore((s) => s.addToast);
  const reload = useAsyncAction(reloadState);
  const leave = useAsyncAction(leaveFamily);
  const [confirmLeave, setConfirmLeave] = useState(false);
  if (!family) return null;

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <BrandMark size={40} />
          <span className="text-lg font-semibold text-ink">Семейный бюджет</span>
        </div>
        <div className="w-12 h-12 rounded-full bg-warning-soft text-warning flex items-center justify-center mb-4" aria-hidden>
          <Hourglass size={22} />
        </div>
        <h1 className="text-[28px] font-bold text-ink leading-tight break-words">Ждём подтверждения</h1>
        <p className="text-ink-2 mt-2">
          {user ? `${user.name}, вы` : 'Вы'} отправили заявку в «{family.name}». Взрослый участник семьи увидит её на вкладке
          «Семья». Как только он подтвердит вход, здесь откроются бюджет и расходы — обновлять страницу не нужно.
        </p>
        <p className="text-sm text-ink-3 mt-3">Пока заявка не подтверждена, данные семьи не видны — так код не даст доступа постороннему.</p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            loading={reload.pending}
            onClick={async () => {
              const res = await reload.run();
              if (res.ok && useFamilyStore.getState().family?.pending) addToast('Заявку ещё не подтвердили', 'info');
            }}
          >
            Проверить
          </Button>
          <Button variant="dangerGhost" icon={<LogOut size={16} />} onClick={() => setConfirmLeave(true)}>
            Отменить заявку
          </Button>
        </div>
        {reload.error && <FormError>{reload.error}</FormError>}
      </div>

      <Presence show={confirmLeave}>
        <ConfirmDialog
          title="Отменить заявку?"
          confirmLabel="Отменить заявку"
          pending={leave.pending}
          error={leave.error}
          onCancel={() => setConfirmLeave(false)}
          onConfirm={async () => {
            const res = await leave.run();
            if (res.ok) addToast('Заявка отменена', 'info');
          }}
        >
          <p>Чтобы войти в «{family.name}» позже, понадобится код или ссылка-приглашение.</p>
        </ConfirmDialog>
      </Presence>
    </main>
  );
}
