// 분양 탭 서비스: 지역별 분양공고 목록, 단지 상세(주택형·경쟁률·가점), 인근 신축 실거래 대비 안전마진.
import "server-only";
import {
  getAnnouncement,
  getCompetition,
  getModels,
  getScores,
  listAnnouncements,
  type Announcement,
  type Competition,
  type HouseModel,
  type Score,
} from "./applyhome";
import { getServiceKey } from "./dataGoKr";
import { demoAnnouncements, demoPresaleDetail, demoRows } from "./demo";
import { fetchTrades, recentMonths, type TradeRow } from "./molit";
import { PROVINCES, findRegion } from "./regions";

export type PresaleStatus = "청약예정" | "접수중" | "발표대기" | "계약" | "완료";

const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function presaleStatus(a: Announcement, today = kstToday()): PresaleStatus {
  const start = a.specialStart || a.receiptStart;
  if (start && today < start) return "청약예정";
  if (a.receiptEnd && today <= a.receiptEnd) return "접수중";
  if (a.winnerDate && today <= a.winnerDate) return "발표대기";
  if (a.contractEnd && today <= a.contractEnd) return "계약";
  return "완료";
}

/** 주소가 해당 구(시)에 속하는지: 단어 단위 비교 ("서구"가 "강서구"에 걸리지 않도록) */
function inDistrict(address: string, districtName: string): boolean {
  if (districtName === "세종시") return true; // 세종은 시도 단위로 판단
  const words = address.split(/\s+/);
  return districtName.split(" ").every((t) => words.includes(t));
}

const inProvince = (address: string, p: { name: string; short: string }) => address.startsWith(p.name) || address.startsWith(p.short);

/** 선택 지역 → 청약홈 주소 검색어 + 결과 필터 */
function regionMatcher(provinceName: string, lawd: string | null) {
  const province = PROVINCES.find((p) => p.name === provinceName) ?? PROVINCES[0];
  const district = lawd ? findRegion(lawd)?.district : undefined;
  if (!district) return { keyword: province.short, label: province.name, match: (a: string) => inProvince(a, province) };
  const tokens = district.name.split(" ");
  const last = tokens[tokens.length - 1];
  return {
    keyword: last === "세종시" ? "세종" : last,
    label: `${province.name} ${district.name}`,
    match: (a: string) => inProvince(a, province) && inDistrict(a, district.name),
  };
}

export type PresaleListItem = Announcement & { status: PresaleStatus };

export async function getPresaleList(provinceName: string, lawd: string | null): Promise<{ demo: boolean; label: string; items: PresaleListItem[] }> {
  const m = regionMatcher(provinceName, lawd);
  const today = kstToday();
  let list: Announcement[];
  let demo = false;
  if (!getServiceKey()) {
    demo = true;
    list = demoAnnouncements(m.label);
  } else {
    const since = new Date(Date.now() + 9 * 3600e3 - 365 * 24 * 3600e3).toISOString().slice(0, 10);
    list = (await listAnnouncements(m.keyword, since)).filter((a) => m.match(a.address));
  }
  const order: Record<PresaleStatus, number> = { 접수중: 0, 청약예정: 1, 발표대기: 2, 계약: 3, 완료: 4 };
  const items = list
    .map((a) => ({ ...a, status: presaleStatus(a, today) }))
    .sort((a, b) => order[a.status] - order[b.status] || b.noticeDate.localeCompare(a.noticeDate));
  return { demo, label: m.label, items };
}

/** 공급위치 주소 → 실거래 조회용 시군구 코드 */
export function lawdFromAddress(address: string): string | null {
  for (const p of PROVINCES) {
    if (!inProvince(address, p)) continue;
    const hit = p.districts.find((d) => inDistrict(address, d.name));
    if (hit) return hit.code;
  }
  return null;
}

export type Comparable = { aptNm: string; buildYear: number; count: number; median: number };

export type ModelRow = HouseModel & {
  competition: { rate: string; requests: number; supply: number } | null; // 1순위 해당지역
  score: { low: number; avg: number; high: number } | null; // 해당지역 당첨가점
  market: { median: number; count: number; basis: string; comparables: Comparable[] } | null;
  margin: number | null; // 인근 시세 - 분양가 (만원)
  marginPct: number | null;
};

export type PresaleDetail = {
  demo: boolean;
  announcement: Announcement & { status: PresaleStatus };
  lawd: string | null;
  models: ModelRow[];
  errors: string[];
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 같은 구 최근 12개월 실거래 중 신축(5년 이내, 부족하면 10년 이내)·유사면적(±5㎡) 중위가격 */
export function marketFor(area: number, trades: TradeRow[], thisYear: number): ModelRow["market"] {
  const near = trades.filter((t) => Math.abs(t.area - area) <= 5);
  for (const years of [5, 10]) {
    const comps = near.filter((t) => t.buildYear >= thisYear - years);
    if (comps.length < 3) continue;
    const byApt = new Map<string, TradeRow[]>();
    for (const t of comps) byApt.set(t.aptNm, [...(byApt.get(t.aptNm) ?? []), t]);
    const comparables = [...byApt.entries()]
      .map(([aptNm, ts]) => ({ aptNm, buildYear: ts[0].buildYear, count: ts.length, median: median(ts.map((t) => t.price)) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    return { median: median(comps.map((t) => t.price)), count: comps.length, basis: `입주 ${years}년 이내·전용 ±5㎡`, comparables };
  }
  return null;
}

export async function getPresaleDetail(houseManageNo: string): Promise<PresaleDetail | null> {
  const today = kstToday();
  const thisYear = Number(today.slice(0, 4));
  const errors: string[] = [];

  if (!getServiceKey()) {
    const d = demoPresaleDetail(houseManageNo);
    if (!d) return null;
    const lawd = lawdFromAddress(d.announcement.address) ?? "11680";
    const trades = demoRows(lawd, "데모신축", recentMonths(12)).trades.map((t) => ({ ...t, buildYear: thisYear - 2 }));
    return {
      demo: true,
      announcement: { ...d.announcement, status: presaleStatus(d.announcement, today) },
      lawd,
      models: combine(d.models, d.competition, d.scores, trades, thisYear),
      errors,
    };
  }

  const announcement = await getAnnouncement(houseManageNo);
  if (!announcement) return null;
  const lawd = lawdFromAddress(announcement.address);
  const soft = <T,>(p: Promise<T[]>, what: string) =>
    p.catch((e) => {
      errors.push(`${what}: ${e instanceof Error ? e.message : e}`);
      return [] as T[];
    });
  const [models, competition, scores, trades] = await Promise.all([
    soft(getModels(houseManageNo), "주택형"),
    soft(getCompetition(houseManageNo), "경쟁률"),
    soft(getScores(houseManageNo), "당첨가점"),
    lawd ? soft(fetchTrades(lawd, recentMonths(12)).then((r) => r.rows), "인근 실거래") : Promise.resolve([] as TradeRow[]),
  ]);
  if (!lawd) errors.push("인근 실거래: 지원 지역(구) 밖이라 비교 불가");
  return {
    demo: false,
    announcement: { ...announcement, status: presaleStatus(announcement, today) },
    lawd,
    models: combine(models, competition, scores, trades, thisYear),
    errors,
  };
}

function combine(models: HouseModel[], competition: Competition[], scores: Score[], trades: TradeRow[], thisYear: number): ModelRow[] {
  const isLocal = (reside: string) => reside.includes("해당");
  return models.map((m) => {
    const c = competition.find((x) => x.modelNo === m.modelNo && x.rank === "1" && isLocal(x.reside));
    const s = scores.find((x) => x.modelNo === m.modelNo && isLocal(x.reside));
    const market = m.area ? marketFor(m.area, trades, thisYear) : null;
    const margin = market && m.topPrice ? market.median - m.topPrice : null;
    return {
      ...m,
      competition: c ? { rate: c.rate, requests: c.requests, supply: c.supply } : null,
      score: s && (s.low || s.avg || s.high) ? { low: s.low, avg: s.avg, high: s.high } : null,
      market,
      margin,
      marginPct: margin !== null && m.topPrice ? margin / m.topPrice : null,
    };
  });
}
