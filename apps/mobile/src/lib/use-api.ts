import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api/index.js";

type Loader<T> = () => Promise<T>;

export function useApi<T>(loader: Loader<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(async (): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      setData(result);
      return result;
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      } else {
        setError(new ApiError(0, "UNKNOWN_ERROR", "Something went wrong."));
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, []);

  return { data, loading, error, reload: run };
}

interface TaskState {
  loading: boolean;
  error: ApiError | null;
}

export function useAsyncTask<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): {
  run: (...args: TArgs) => Promise<boolean>;
  loading: boolean;
  error: ApiError | null;
  clear: () => void;
} {
  const [state, setState] = useState<TaskState>({ loading: false, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args: TArgs): Promise<boolean> => {
    setState({ loading: true, error: null });
    try {
      await fnRef.current(...args);
      setState({ loading: false, error: null });
      return true;
    } catch (err) {
      const error =
        err instanceof ApiError ? err : new ApiError(0, "UNKNOWN_ERROR", "Something went wrong.");
      setState({ loading: false, error });
      return false;
    }
  }, []);

  const clear = useCallback(() => setState({ loading: false, error: null }), []);

  return { run, loading: state.loading, error: state.error, clear };
}
