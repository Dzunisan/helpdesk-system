import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, toApiError } from "@/services/apiClient";

interface Result<T> {
  /** The key + reload counter this result belongs to */
  tag: string;
  key: string;
  data: T | null;
  error: ApiError | null;
}

export interface ApiData<T> {
  data: T | null;
  error: ApiError | null;
  /** First load for this key: show skeletons */
  loading: boolean;
  /** A reload is running in the background: keep showing the old data */
  refreshing: boolean;
  /** Load again without blanking the page (after a reply, a status change, "Try again") */
  reload: () => void;
  /** Replace the data with a fresh copy the server just returned (e.g. the ticket from a transition) */
  setData: (data: T) => void;
}

/**
 * Loads one thing from the Sprint 1 API clients and keeps it while it reloads.
 * `key` identifies what is loaded (e.g. the ticket id): a new key shows the loading state again.
 * @example const ticket = useApiData(() => getTicket(id), `ticket-${id}`);
 */
export function useApiData<T>(load: () => Promise<T>, key: string): ApiData<T> {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  const loadRef = useRef(load);
  const tag = `${key}#${version}`;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let alive = true;
    loadRef.current().then(
      (data) => alive && setResult({ tag, key, data, error: null }),
      // A failed reload keeps what is already on screen; only a failed first load has no data
      (error: unknown) =>
        alive &&
        setResult((previous) => ({
          tag,
          key,
          data: previous?.key === key ? previous.data : null,
          error: toApiError(error),
        })),
    );
    return () => {
      alive = false;
    };
  }, [tag, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback(
    (data: T) => setResult((current) => (current ? { ...current, data, error: null } : current)),
    [],
  );

  const sameKey = result !== null && result.key === key;
  return {
    data: sameKey ? result.data : null,
    error: sameKey ? result.error : null,
    loading: !sameKey,
    refreshing: sameKey && result.tag !== tag,
    reload,
    setData,
  };
}
