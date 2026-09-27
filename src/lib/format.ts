// 금액(만원 단위)·비율 표시 포맷.

export function formatEok(manwon: number | null | undefined): string {
  if (manwon === null || manwon === undefined || !Number.isFinite(manwon)) return "—";
  const sign = manwon < 0 ? "-" : "";
  const v = Math.round(Math.abs(manwon));
  const e = Math.floor(v / 10000);
  const r = v % 10000;
  if (!e) return `${sign}${r.toLocaleString("ko-KR")}만`;
  return r ? `${sign}${e}억 ${r.toLocaleString("ko-KR")}만` : `${sign}${e}억`;
}

/** 차트 라벨용 짧은 표기: 39.42억 */
export function formatEokShort(manwon: number): string {
  return `${(manwon / 10000).toFixed(2)}억`;
}

export function formatPct(x: number | null | undefined, digits = 1, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = (x * 100).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`; // "-0%" 방지
  return `${signed && x > 0 ? "+" : ""}${s}%`;
}

/** 202509 → 25.09 */
export function formatYmShort(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** 202509 → 2025.09 */
export function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}
