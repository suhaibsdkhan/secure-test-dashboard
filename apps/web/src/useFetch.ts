import { useEffect, useState } from "react";

/** Fetches whenever `key` changes; results for a stale key are discarded. */
export function useFetch<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const [state, setState] = useState<{ key?: string; data?: T; error?: string }>({});
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal)
      .then((data) => setState({ key, data }))
      .catch((err: Error) => {
        if (!ctrl.signal.aborted) setState({ key, error: err.message });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : {};
}
