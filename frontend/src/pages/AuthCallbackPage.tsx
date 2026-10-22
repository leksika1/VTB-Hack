import { useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { completeOidc, errorMessage } from '../api/client';
import { BrandMark } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';

export type OidcOutcome = 'session' | 'unlinked' | 'linked' | 'failed';

/** state is one-time on the server: the same callback must not be sent twice (StrictMode runs effects twice) */
let inFlight: { state: string; promise: ReturnType<typeof completeOidc> } | null = null;

function finish(code: string, state: string) {
  if (inFlight?.state !== state) inFlight = { state, promise: completeOidc(code, state) };
  return inFlight.promise;
}

/**
 * /auth/callback — the bank returns here with ?code&state (or ?error when the person cancelled).
 * The backend checks everything; this page only passes the code on and routes by the answer.
 */
export function AuthCallbackPage({ onDone }: { onDone: (outcome: OidcOutcome) => void }) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const code = params.get('code');
  const state = params.get('state');
  const [error, setError] = useState<string | null>(() =>
    code && state ? null : params.get('error') ? 'Вход через банк отменён.' : 'Ссылка входа неполная. Начните вход заново.'
  );

  useEffect(() => {
    if (!code || !state) return;
    let alive = true;
    finish(code, state).then(
      (outcome) => alive && onDone(outcome),
      (e) => alive && setError(errorMessage(e))
    );
    return () => {
      alive = false;
    };
  }, [code, state, onDone]);

  return (
    <main className="min-h-dvh flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-6">
          <BrandMark size={44} />
        </div>
        {error ? (
          <div role="alert">
            <div className="w-12 h-12 mx-auto rounded-full bg-danger-soft text-danger flex items-center justify-center mb-3" aria-hidden>
              <CircleAlert size={22} />
            </div>
            <h1 className="text-xl font-semibold text-ink">Не удалось войти через банк</h1>
            <p className="text-ink-2 mt-2">{error}</p>
            <Button className="mt-5" onClick={() => onDone('failed')}>
              Вернуться в приложение
            </Button>
          </div>
        ) : (
          <div aria-busy="true">
            <LoaderCircle size={28} className="mx-auto animate-spin text-accent-ink" aria-hidden />
            <p className="text-ink-2 mt-3">Завершаем вход через банк…</p>
          </div>
        )}
      </div>
    </main>
  );
}
