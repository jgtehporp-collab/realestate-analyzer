// 서울·경기 구(시)별·생활권별 가격/변동/거래량 통계 (순수 함수). 급등·급락과 같은 일일 작업에서 계산해
// src/data/region-stats.json에 저장하고, 매매 화면의 지도가 읽음.
import { computeComplexChanges, usableTrade, type HotTrade } from "./hot";
import type { TradeRow } from "./molit";

/** 서울 2030 생활권계획 5대 권역 + 경기 5개 권역 (지역 코드 → 권역) */
export const ZONES: { zone: string; province: "서울" | "경기"; codes: string[] }[] = [
  { zone: "도심권", province: "서울", codes: ["11110", "11140", "11170"] },
  { zone: "동북권", province: "서울", codes: ["11200", "11215", "11230", "11260", "11290", "11305", "11320", "11350"] },
  { zone: "서북권", province: "서울", codes: ["11380", "11410", "11440"] },
  { zone: "서남권", province: "서울", codes: ["11470", "11500", "11530", "11545", "11560", "11590", "11620"] },
  { zone: "동남권", province: "서울", codes: ["11650", "11680", "11710", "11740"] },
  {
    zone: "경부축(남부)",
    province: "경기",
    codes: ["41111", "41113", "41115", "41117", "41131", "41133", "41135", "41461", "41463", "41465", "41590", "41370", "41220"],
  },
  { zone: "서남부", province: "경기", codes: ["41171", "41173", "41410", "41430", "41290", "41210", "41271", "41273", "41390", "41190"] },
  { zone: "서북부", province: "경기", codes: ["41281", "41285", "41287", "41480", "41570"] },
  { zone: "동북부", province: "경기", codes: ["41150", "41630", "41310", "41360"] },
  { zone: "동남부", province: "경기", codes: ["41450", "41610", "41500"] },
];

export const zoneOf = (lawd: string) => ZONES.find((z) => z.codes.includes(lawd))?.zone ?? "기타";

export type RegionStat = {
  lawd: string;
  region: string; // "서울 강남구"
  zone: string;
  lat: number | null;
  lng: number | null;
  price84: number | null; // 최근 3개월 전용 84㎡ 환산 중위가(만원)
  change: number | null; // 최근 3개월 vs 직전 6개월 ㎡당 중위가 변동
  recentCount: number; // 최근 3개월 거래
  prevCount: number; // 그 직전 3개월 거래
  volChange: number | null;
  monthly: (number | null)[]; // 월별 84㎡ 환산 중위가 (months 순서)
  top: { id: string; aptNm: string; band: string; change: number; recentMedian: number }[]; // 지역 내 상승 상위
};

export type ZoneStat = {
  zone: string;
  province: string;
  price84: number | null;
  change: number | null;
  recentCount: number;
  volChange: number | null;
};

export type RegionStatsFile = {
  generatedAt: string | null;
  months: string[];
  basis: string;
  regions: RegionStat[];
  zones: ZoneStat[];
};

const MIN_GROUP = 10; // 변동률 산출 최소 거래 (최근·직전 각각)
const MIN_MONTH = 3; // 월별 중위가 표시 최소 거래

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const perM2 = (t: TradeRow) => t.price / t.area;

function summarize(rows: TradeRow[], months: string[]) {
  const recentSet = new Set(months.slice(-3));
  const baseSet = new Set(months.slice(0, -3));
  const prevSet = new Set(months.slice(-6, -3));
  const recent = rows.filter((t) => recentSet.has(t.ym));
  const base = rows.filter((t) => baseSet.has(t.ym));
  const prevCount = rows.filter((t) => prevSet.has(t.ym)).length;
  const r = median(recent.map(perM2));
  const b = median(base.map(perM2));
  return {
    price84: r === null || recent.length < MIN_MONTH ? null : Math.round(r * 84),
    change: r !== null && b !== null && recent.length >= MIN_GROUP && base.length >= MIN_GROUP ? r / b - 1 : null,
    recentCount: recent.length,
    prevCount,
    volChange: prevCount >= MIN_GROUP ? recent.length / prevCount - 1 : null,
  };
}

export function computeRegionStats(
  byLawd: { lawd: string; region: string; rows: TradeRow[]; center?: { lat: number; lng: number } | null }[],
  months: string[],
): { regions: RegionStat[]; zones: ZoneStat[] } {
  const complexes: HotTrade[] = computeComplexChanges(byLawd, months);
  const regions: RegionStat[] = byLawd.map(({ lawd, region, rows, center }) => {
    const usable = rows.filter(usableTrade);
    const monthly = months.map((ym) => {
      const xs = usable.filter((t) => t.ym === ym);
      const m = median(xs.map(perM2));
      return m === null || xs.length < MIN_MONTH ? null : Math.round(m * 84);
    });
    const seen = new Set<string>();
    const top = complexes
      .filter((c) => c.lawd === lawd && c.change > 0)
      .sort((a, b) => b.change - a.change)
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
      .slice(0, 3)
      .map((c) => ({ id: c.id, aptNm: c.aptNm, band: c.band, change: c.change, recentMedian: c.recentMedian }));
    return {
      lawd,
      region,
      zone: zoneOf(lawd),
      lat: center?.lat ?? null,
      lng: center?.lng ?? null,
      ...summarize(usable, months),
      monthly,
      top,
    };
  });

  const zones: ZoneStat[] = ZONES.map(({ zone, province, codes }) => {
    const rows = byLawd.filter((x) => codes.includes(x.lawd)).flatMap((x) => x.rows.filter(usableTrade));
    const s = summarize(rows, months);
    return { zone, province, price84: s.price84, change: s.change, recentCount: s.recentCount, volChange: s.volChange };
  });
  return { regions, zones };
}
