import { useCallback, useEffect, useState } from "react";
import { ApiError, toApiError } from "@/services/apiClient";

export interface Loader<T> {
  /** null until the first load succeeds */
  data: T | null;
  /** The last failure; cleared by the next success */
  error: ApiError | null;
  /** True while a load (first or reload) is running */
  loading: boolean;
  /** Load again (keeps the current data on screen while it runs) */
  reload: () => void;
  /** Replace the data locally after a save, without a round trip */
  setData: (update: (current: T | null) => T | null) => void;
}

/**
 * Loads `load()` once on mount and again on `reload()`, for the admin pages that read
 * through the Sprint 1 clients in src/services. Errors come back as ApiError.
 * @example const users = useLoader(listUsers); users.data?.map(...)
 */
export function useLoader<T>(load: () => Promise<T>): Loader<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        setDataState(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level client function; `key` is the reload trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => {
    setLoading(true);
    setKey((k) => k + 1);
  }, []);

  const setData = useCallback((update: (current: T | null) => T | null) => setDataState(update), []);

  return { data, error, loading, reload, setData };
}
