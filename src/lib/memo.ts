// 서버 프로세스 메모리 TTL 캐시 (실패한 결과는 캐시하지 않음).
const store = new Map<string, { expires: number; value: Promise<unknown> }>();

export function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { expires: Date.now() + ttlMs, value });
  value.catch(() => store.delete(key));
  if (store.size > 2000) {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
  }
  return value;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
