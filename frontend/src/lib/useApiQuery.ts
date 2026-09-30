import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { messageOf } from './http';

export type ApiQuery<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

/**
 * Tải dữ liệu khi mount hoặc khi deps đổi; bỏ kết quả của request cũ nếu có request mới hơn.
 * `reload()` tải lại sau khi ghi (tạo, chốt…) mà vẫn giữ dữ liệu cũ trên màn trong lúc chờ.
 */
export function useApiQuery<T>(fetcher: () => Promise<T>, deps: DependencyList): ApiQuery<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const seq = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (id === seq.current) setData(result);
      })
      .catch((err) => {
        if (id === seq.current) setError(messageOf(err));
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading: loading && data === undefined, error, reload };
}
