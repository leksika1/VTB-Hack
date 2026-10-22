import { useCallback, useRef, useState } from 'react';
import { ApiError, errorMessage } from '../api/client';

/**
 * Wraps a request: blocks repeated submission while pending, keeps the error
 * (and the field it belongs to) so the form can show it next to the input.
 * Form values live in the component and are untouched on failure.
 */
export function useAsyncAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false }> => {
      if (inFlight.current) return { ok: false };
      inFlight.current = true;
      setPending(true);
      setError(null);
      setErrorField(null);
      try {
        const value = await action(...args);
        return { ok: true, value };
      } catch (e) {
        setError(errorMessage(e));
        setErrorField(e instanceof ApiError ? e.field ?? null : null);
        return { ok: false };
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [action]
  );

  const reset = useCallback(() => {
    setError(null);
    setErrorField(null);
  }, []);

  return { run, pending, error, errorField, reset };
}

/** A stable idempotency key for one opened form. Cryptographically random: a guessable key could replay someone else's request */
export function useRequestId(): string {
  const [id] = useState(() => crypto.randomUUID());
  return id;
}
