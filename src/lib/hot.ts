// 서울·경기 급등·급락 단지 산출 (순수 함수). 매일 GitHub Actions에서 scripts/build-hot-trades.ts로 실행해
// src/data/hot-trades.json에 저장하고, 매매 화면이 그 파일을 읽음.
import { areaBand, complexId } from "./analysis";
import type { TradeRow } from "./molit";

export type HotTrade = {
  lawd: string;
  region: string; // "서울 강남구"
  id: string; // 리포트 링크용 단지 id
  aptNm: string;
  umdNm: string;
  band: string; // "30평대"
  area: number; // 대표 전용면적
  baseMedian: number; // 이전 6개월 중위가(만원)
  recentMedian: number; // 최근 3개월 중위가
  change: number; // recent/base - 1
  baseCount: number;
  recentCount: number;
  newHigh: boolean; // 최근 거래가 이전 6개월 최고가 초과
  lastYm: string;
};

export type HotTradesFile = {
  generatedAt: string | null;
  basis: string;
  up: HotTrade[];
  down: HotTrade[];
  failed: string[];
};

/** 도시형생활주택: 소형·호수별 가격 편차가 커서 중위가 비교가 왜곡됨 (실거래 단지명에 표기됨) */
export const isUrbanHousing = (aptNm: string) => aptNm.replace(/\s+/g, "").includes("도시형");

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const MIN_RECENT = 3;
export const MIN_BASE = 5;
export const MIN_PRICE = 10000; // 1억 미만 제외
export const MIN_CHANGE = 0.03;

/**
 * months: 오래된 순 9개월 (앞 6개월 = 기준, 뒤 3개월 = 최근).
 * 같은 단지·같은 평형대끼리 최근 3개월 중위가 vs 이전 6개월 중위가 비교. 직거래·해제거래·1층 이하·도시형생활주택 제외.
 */
/** 급등·급락·생활권 분석 공통 거래 필터: 직거래·1억 미만·1층 이하(저층 할인 왜곡)·도시형생활주택 제외 */
export const usableTrade = (t: TradeRow) => !t.direct && t.price >= MIN_PRICE && t.floor > 1 && !isUrbanHousing(t.aptNm);

/** 단지·평형별 최근 3개월 vs 직전 6개월 중위가 변동 (거래 건수 기준 충족한 전체 목록) */
export function computeComplexChanges(byLawd: { lawd: string; region: string; rows: TradeRow[] }[], months: string[]): HotTrade[] {
  const recentSet = new Set(months.slice(-3));
  const baseSet = new Set(months.slice(0, -3));
  const out: HotTrade[] = [];
  for (const { lawd, region, rows } of byLawd) {
    const groups = new Map<string, TradeRow[]>();
    for (const t of rows) {
      if (!usableTrade(t)) continue;
      const key = `${complexId(t)}#${areaBand(t.area)}`;
      const g = groups.get(key);
      if (g) g.push(t);
      else groups.set(key, [t]);
    }
    for (const [key, ts] of groups) {
      const recent = ts.filter((t) => recentSet.has(t.ym));
      const base = ts.filter((t) => baseSet.has(t.ym));
      if (recent.length < MIN_RECENT || base.length < MIN_BASE) continue;
      // 면적 혼재 보정: 대표면적 기준 ㎡당 가격
      const areaCount = new Map<number, number>();
      for (const t of ts) areaCount.set(t.area, (areaCount.get(t.area) ?? 0) + 1);
      const mainArea = [...areaCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const adj = (t: TradeRow) => (t.price / t.area) * mainArea;
      const baseMedian = median(base.map(adj));
      const recentMedian = median(recent.map(adj));
      const band = Number(key.split("#")[1]);
      out.push({
        lawd,
        region,
        id: key.split("#")[0],
        aptNm: ts[0].aptNm,
        umdNm: ts[0].umdNm,
        band: band >= 60 ? "60평대 이상" : band <= 10 ? "10평대 이하" : `${band}평대`,
        area: mainArea,
        baseMedian: Math.round(baseMedian),
        recentMedian: Math.round(recentMedian),
        change: recentMedian / baseMedian - 1,
        baseCount: base.length,
        recentCount: recent.length,
        newHigh: Math.max(...recent.map(adj)) > Math.max(...base.map(adj)),
        lastYm: recent.map((t) => t.ym).sort().at(-1)!,
      });
    }
  }
  return out;
}

export function computeHotTrades(
  byLawd: { lawd: string; region: string; rows: TradeRow[] }[],
  months: string[],
  limit = 5,
): { up: HotTrade[]; down: HotTrade[] } {
  const out = computeComplexChanges(byLawd, months);
  // 한 단지는 한 번만 (변동폭이 가장 큰 평형)
  const pick = (list: HotTrade[]) => {
    const seen = new Set<string>();
    return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, limit);
  };
  const up = pick(out.filter((x) => x.change > MIN_CHANGE).sort((a, b) => b.change - a.change));
  const down = pick(out.filter((x) => x.change < -MIN_CHANGE).sort((a, b) => a.change - b.change));
  return { up, down };
}
