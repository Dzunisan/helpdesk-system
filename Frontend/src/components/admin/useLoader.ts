import { useApiData } from "@/hooks/useApiData";
import type { ApiError } from "@/services/apiClient";

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
 * The admin pages' view of the shared useApiData hook (hooks/useApiData.ts): loads `load()` once
 * on mount and again on `reload()`, with `loading` true during any load.
 * @example const users = useLoader(listUsers); users.data?.map(...)
 */
export function useLoader<T>(load: () => Promise<T>): Loader<T> {
  const result = useApiData(load, "once");
  return {
    data: result.data,
    error: result.error,
    loading: result.loading || result.refreshing,
    reload: result.reload,
    setData: result.setData,
  };
}
