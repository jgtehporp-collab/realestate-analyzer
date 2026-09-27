// API 키가 없을 때 화면 확인용으로 쓰는 결정적(같은 입력 → 같은 결과) 가상 실거래 데이터.
import type { RentRow, TradeRow } from "./molit";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(lawd: string, aptNm: string, months: string[]): { trades: TradeRow[]; rents: RentRow[] } {
  const rand = rng(hash(`${lawd}:${aptNm}`));
  const seoul = lawd.startsWith("11");
  const base84 = (seoul ? 120000 : 55000) * (0.7 + rand() * 0.8); // 만원
  const buildYear = 2000 + Math.floor(rand() * 25);
  const aptSeq = `demo-${hash(aptNm) % 100000}`;
  const common = { aptSeq, aptNm, umdNm: "데모동", jibun: `${1 + Math.floor(rand() * 900)}`, buildYear };

  // 상승 → 전고점 → 조정 → 회복 흐름
  const peakAt = Math.floor(months.length * (0.55 + rand() * 0.2));
  const trend = (i: number) => {
    if (i <= peakAt) return 0.82 + (0.18 * i) / peakAt;
    const k = (i - peakAt) / Math.max(1, months.length - 1 - peakAt);
    return 1 - 0.1 * Math.sin(Math.PI * Math.min(1, k * 1.4)) - 0.03 * k;
  };
  const jeonseRatio = 0.45 + rand() * 0.25;

  const trades: TradeRow[] = [];
  const rents: RentRow[] = [];
  const types = [
    { area: 84.97, mult: 1 },
    { area: 59.92, mult: 0.74 },
  ];
  months.forEach((ym, i) => {
    for (const t of types) {
      const n = Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const price = Math.round((base84 * t.mult * trend(i) * (0.96 + rand() * 0.08)) / 100) * 100;
        trades.push({ ...common, area: t.area, price, floor: 2 + Math.floor(rand() * 25), ym, day: 1 + Math.floor(rand() * 28) });
      }
      const r = 2 + Math.floor(rand() * 5);
      for (let k = 0; k < r; k++) {
        const wolse = rand() < 0.3;
        const deposit = Math.round((base84 * t.mult * jeonseRatio * (0.95 + rand() * 0.1) * (wolse ? 0.3 : 1)) / 500) * 500;
        rents.push({
          ...common,
          area: t.area,
          deposit,
          monthly: wolse ? 100 + Math.floor(rand() * 150) : 0,
          floor: 2 + Math.floor(rand() * 25),
          ym,
          day: 1 + Math.floor(rand() * 28),
        });
      }
    }
  });
  return { trades, rents };
}
