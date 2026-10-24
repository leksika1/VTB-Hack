import { useCallback, useEffect, useState } from 'react';
import { errorMessage, loadInitialData, OIDC_CALLBACK_PATH, refreshData, subscribeToChanges, takeReturnInvite } from './api/client';
import { useFamilyStore, useIsParent } from './store/familyStore';
import { useUIStore } from './store/uiStore';
import { AppShell } from './components/layout/AppShell';
import { ModalHost } from './components/layout/ModalHost';
import { Toasts } from './components/ui/Toasts';
import { ErrorState, PageSkeleton } from './components/ui/Feedback';
import { OverviewPage } from './pages/OverviewPage';
import { OperationsPage } from './pages/OperationsPage';
import { PlanPage } from './pages/PlanPage';
import { FamilyPage } from './pages/FamilyPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { AuthCallbackPage, type OidcOutcome } from './pages/AuthCallbackPage';
import { WaitingApprovalPage } from './pages/WaitingApprovalPage';
import { buildInviteUrl, readInviteFromUrl } from './components/family/invite';

function useThemeAttribute() {
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1424' : '#f2f4f7');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/** Safety net in case the event stream is cut by a proxy without the client noticing */
const FALLBACK_SYNC_MS = 60_000;

/** Pick up what other family members changed: instantly via the event stream, plus a rare fallback poll */
function useFamilySync(sessionKey: string | null) {
  useEffect(() => {
    if (!sessionKey) return;
    let pending: number | undefined;
    // Several changes in a row → one reload
    const sync = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => refreshData().catch(() => {}), 300);
    };
    const unsubscribe = subscribeToChanges(sync);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && sync(), FALLBACK_SYNC_MS);
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      window.clearTimeout(pending);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sessionKey]);
}

export default function App() {
  useThemeAttribute();
  const family = useFamilyStore((s) => s.family);
  const isParent = useIsParent();
  // A child has no «План» tab; a tab left over from an adult session falls back to the overview
  const storedTab = useUIStore((s) => s.tab);
  const tab = storedTab === 'plan' && !isParent ? 'overview' : storedTab;
  const dataStatus = useUIStore((s) => s.dataStatus);
  const setDataStatus = useUIStore((s) => s.setDataStatus);
  const simulateErrors = useUIStore((s) => s.simulateErrors);
  const setSimulateErrors = useUIStore((s) => s.setSimulateErrors);
  const [loadError, setLoadError] = useState('');
  // An invite link opened by someone who already has a family still shows the invite screen
  const [invite, setInvite] = useState(readInviteFromUrl);
  const pendingInvite = invite && invite !== family?.inviteCode;
  // The bank returns to /auth/callback; the rest of the app waits until the sign-in is finished
  const [oidcCallback, setOidcCallback] = useState(() => window.location.pathname === OIDC_CALLBACK_PATH);
  const setTab = useUIStore((s) => s.setTab);
  const addToast = useUIStore((s) => s.addToast);
  // Keyed by family id: switching family or demo user reconnects the stream with the new token
  const currentUserId = useFamilyStore((s) => s.currentUserId);
  useFamilySync(family && dataStatus === 'ready' ? `${family.id}:${currentUserId}` : null);

  const fetchData = useCallback(async () => {
    try {
      await loadInitialData();
      setDataStatus('ready');
    } catch (e) {
      setLoadError(errorMessage(e));
      setDataStatus('error');
    }
  }, [setDataStatus]);

  const retry = () => {
    setDataStatus('loading');
    fetchData();
  };

  // Initial status is already 'loading'
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onOidcDone = useCallback(
    (outcome: OidcOutcome) => {
      // Back to the invite that was open before going to the bank, otherwise to the start page
      const returnInvite = outcome === 'unlinked' ? takeReturnInvite() : null;
      window.history.replaceState(null, '', returnInvite ? buildInviteUrl(returnInvite) : '/');
      setInvite(returnInvite);
      setOidcCallback(false);
      setDataStatus('ready');
      const name = useFamilyStore.getState().family?.members.find((m) => m.id === useFamilyStore.getState().currentUserId)?.name;
      if (outcome === 'session') addToast(name ? `Вы вошли как ${name}` : 'Вы вошли через банк');
      if (outcome === 'linked') {
        setTab('family');
        addToast('ВТБ ID привязан — теперь можно входить через банк');
      }
    },
    [addToast, setDataStatus, setTab]
  );

  if (oidcCallback) {
    return (
      <>
        <AuthCallbackPage onDone={onOidcDone} />
        <Toasts />
      </>
    );
  }

  if (!family || pendingInvite) {
    return (
      <>
        <OnboardingPage invite={pendingInvite ? invite : null} onInviteDismiss={() => setInvite(null)} />
        <Toasts />
      </>
    );
  }

  if (family.pending) {
    return (
      <>
        <WaitingApprovalPage />
        <Toasts />
      </>
    );
  }

  return (
    <>
      <AppShell>
        {dataStatus === 'loading' && <PageSkeleton />}
        {dataStatus === 'error' && (
          <>
            <ErrorState message={loadError} onRetry={retry} />
            {simulateErrors && (
              <p className="text-center text-sm text-ink-3">
                Включена имитация ошибок.{' '}
                <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => setSimulateErrors(false)}>
                  Выключить
                </button>
              </p>
            )}
          </>
        )}
        {dataStatus === 'ready' && (
          <div key={tab} className="animate-tab-in">
            {tab === 'overview' && <OverviewPage />}
            {tab === 'operations' && <OperationsPage />}
            {tab === 'plan' && <PlanPage />}
            {tab === 'family' && <FamilyPage />}
          </div>
        )}
      </AppShell>
      <ModalHost />
      <Toasts />
    </>
  );
}
