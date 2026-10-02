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
  reb?: RebStat | null; // 한국부동산원 주간 매매가격지수
  pop?: PopStat | null; // KOSIS 주민등록인구
};

export type RebStat = {
  lastWeek: string; // 마지막 주 설명 (예: "2026년 9월 4주")
  index: number;
  wow: number | null; // 전주 대비
  chg4w: number | null;
  chg12w: number | null;
  series: number[]; // 최근 26주 지수 (오래된 순)
};

export type PopStat = { ym: string; total: number; yoy: number | null };

/** 공식 통계 원자료(프록시 응답 형태) */
export type RebRowLike = { cls: string; full: string; week: string; desc: string; value: number };
export type PopRowLike = { code: string; name: string; ym: string; value: number };

const ratio = (a: number | undefined, b: number | undefined) => (a !== undefined && b !== undefined && b ? a / b - 1 : null);

/** "서울 강남구" / "경기 수원시 장안구" ↔ R-ONE 지역(CLS_NM·CLS_FULLNM) 매칭 */
function rebMatches(region: string, row: RebRowLike): boolean {
  const [province, ...tokens] = region.split(" ");
  if (!row.full.startsWith(province)) return false;
  const cls = row.cls.replace(/\s+/g, "");
  if (cls === tokens.join("")) return true; // "수원시장안구"처럼 한 이름으로 오는 경우
  if (cls !== tokens[tokens.length - 1]) return false;
  // "장안구"만 오면 상위 시(수원)가 전체 경로에 있어야 함 (서울 중구 vs 다른 중구 등 구분)
  return tokens.length === 1 || row.full.includes(tokens[0].replace(/시$/, ""));
}

export function rebStatFor(region: string, rows: RebRowLike[]): RebStat | null {
  const mine = rows.filter((r) => rebMatches(region, r));
  if (!mine.length) return null;
  // 같은 이름이 다른 상위지역에도 있으면 첫 번째 계열만
  const full = mine[0].full;
  const byWeek = new Map<string, RebRowLike>();
  for (const r of mine) if (r.full === full) byWeek.set(r.week, r);
  const series = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)).slice(-26);
  const v = series.map((r) => r.value);
  const n = v.length;
  if (!n) return null;
  return {
    lastWeek: series[n - 1].desc || series[n - 1].week,
    index: v[n - 1],
    wow: ratio(v[n - 1], v[n - 2]),
    chg4w: ratio(v[n - 1], v[n - 5]),
    chg12w: ratio(v[n - 1], v[n - 13]),
    series: v,
  };
}

export function popStatFor(lawd: string, rows: PopRowLike[]): PopStat | null {
  const mine = rows.filter((r) => r.code.slice(0, 5) === lawd && (r.code.length <= 5 || /^0+$/.test(r.code.slice(5)))).sort((a, b) => a.ym.localeCompare(b.ym));
  if (!mine.length) return null;
  const last = mine[mine.length - 1];
  const yearAgo = mine.find((r) => Number(r.ym) === Number(last.ym) - 100);
  return { ym: last.ym, total: last.value, yoy: yearAgo ? last.value / yearAgo.value - 1 : null };
}

/** 지역 통계에 R-ONE·KOSIS 지표를 붙이고 생활권 평균 계산 */
export function attachOfficial(regions: RegionStat[], zones: ZoneStat[], reb: RebRowLike[] | null, pop: PopRowLike[] | null) {
  for (const r of regions) {
    if (reb) r.reb = rebStatFor(r.region, reb);
    if (pop) r.pop = popStatFor(r.lawd, pop);
  }
  for (const z of zones) {
    const members = regions.filter((r) => r.zone === z.zone);
    const chg = members.map((r) => r.reb?.chg12w).filter((x): x is number => typeof x === "number");
    z.rebChg12w = chg.length ? chg.reduce((a, b) => a + b, 0) / chg.length : null;
    const now = members.reduce((a, r) => a + (r.pop?.total ?? 0), 0);
    const ago = members.reduce((a, r) => a + (r.pop && r.pop.yoy !== null ? r.pop.total / (1 + r.pop.yoy) : 0), 0);
    z.popYoy = now && ago ? now / ago - 1 : null;
  }
}

export type ZoneStat = {
  zone: string;
  province: string;
  price84: number | null;
  change: number | null;
  recentCount: number;
  volChange: number | null;
  rebChg12w?: number | null; // 소속 구 R-ONE 12주 변동 평균
  popYoy?: number | null; // 인구 전년비
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
