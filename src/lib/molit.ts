// 국토교통부 아파트 매매/전월세 실거래가 API (data.go.kr) 클라이언트.
// 서버 전용: DATA_GO_KR_KEY 환경변수가 필요하며 브라우저로 노출되지 않음.
import "server-only";
import { callDataGoKr, getServiceKey, num, str, type RawItem } from "./dataGoKr";

export { getServiceKey };

export type TradeRow = {
  aptSeq: string;
  aptNm: string;
  umdNm: string;
  jibun: string;
  buildYear: number;
  area: number; // 전용면적(㎡)
  price: number; // 만원
  floor: number;
  ym: string; // YYYYMM
  day: number;
};

export type RentRow = {
  aptSeq: string;
  aptNm: string;
  umdNm: string;
  jibun: string;
  buildYear: number;
  area: number;
  deposit: number; // 만원
  monthly: number; // 만원
  floor: number;
  ym: string;
  day: number;
};

type Kind = "trade" | "rent";

const ENDPOINTS: Record<Kind, string> = {
  trade: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  rent: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
};

const PAGE_SIZE = 1000;
const HOUR = 60 * 60 * 1000;


/** KST 기준 최근 n개월(이번 달 포함)을 오래된 순서의 YYYYMM 배열로 반환. */
export function recentMonths(n: number, now = new Date()): string[] {
  const kst = new Date(now.getTime() + 9 * HOUR);
  let y = kst.getUTCFullYear();
  let m = kst.getUTCMonth() + 1;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
}

async function fetchPage(kind: Kind, lawd: string, ym: string, page: number) {
  return callDataGoKr(
    ENDPOINTS[kind],
    { LAWD_CD: lawd, DEAL_YMD: ym, numOfRows: PAGE_SIZE, pageNo: page },
    kind === "trade" ? "매매 실거래가 API" : "전월세 실거래가 API",
  );
}

function toTrade(it: RawItem, ym: string): TradeRow | null {
  if (str(it.cdealType) === "O") return null; // 해제된 거래 제외
  const price = num(it.dealAmount);
  if (!price) return null;
  return {
    aptSeq: str(it.aptSeq),
    aptNm: str(it.aptNm),
    umdNm: str(it.umdNm),
    jibun: str(it.jibun),
    buildYear: num(it.buildYear),
    area: num(it.excluUseAr),
    price,
    floor: num(it.floor),
    ym,
    day: num(it.dealDay),
  };
}

function toRent(it: RawItem, ym: string): RentRow | null {
  const deposit = num(it.deposit);
  if (!deposit) return null;
  return {
    aptSeq: str(it.aptSeq),
    aptNm: str(it.aptNm),
    umdNm: str(it.umdNm),
    jibun: str(it.jibun),
    buildYear: num(it.buildYear),
    area: num(it.excluUseAr),
    deposit,
    monthly: num(it.monthlyRent),
    floor: num(it.floor),
    ym,
    day: num(it.dealDay),
  };
}

async function fetchMonthUncached(kind: Kind, lawd: string, ym: string): Promise<RawItem[]> {
  const first = await fetchPage(kind, lawd, ym, 1);
  const all = [...first.items];
  const pages = Math.ceil(first.totalCount / PAGE_SIZE);
  for (let p = 2; p <= pages; p++) {
    const next = await fetchPage(kind, lawd, ym, p);
    all.push(...next.items);
  }
  return all;
}

// 프로세스 메모리 캐시. 지난달 이전 자료는 거의 바뀌지 않으므로 길게, 최근 2개월은 짧게 보관.
const cache = new Map<string, { expires: number; value: Promise<RawItem[]> }>();

function monthTtl(ym: string): number {
  const recent = recentMonths(2);
  return recent.includes(ym) ? 3 * HOUR : 24 * HOUR;
}

function fetchMonth(kind: Kind, lawd: string, ym: string): Promise<RawItem[]> {
  const cacheKey = `${kind}:${lawd}:${ym}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = fetchMonthUncached(kind, lawd, ym).catch(() =>
    // 한 번 재시도
    fetchMonthUncached(kind, lawd, ym),
  );
  cache.set(cacheKey, { expires: Date.now() + monthTtl(ym), value });
  value.catch(() => cache.delete(cacheKey));
  if (cache.size > 5000) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expires < now) cache.delete(k);
  }
  return value;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type FetchResult<T> = { rows: T[]; failedMonths: string[] };

async function fetchMonths<T>(
  kind: Kind,
  lawd: string,
  months: string[],
  convert: (it: RawItem, ym: string) => T | null,
): Promise<FetchResult<T>> {
  if (!getServiceKey()) throw new Error("DATA_GO_KR_KEY가 설정되지 않았습니다.");
  const failedMonths: string[] = [];
  let lastError: unknown = null;
  const perMonth = await mapWithConcurrency(months, 6, async (ym) => {
    try {
      const items = await fetchMonth(kind, lawd, ym);
      return items.map((it) => convert(it, ym)).filter((x): x is T => x !== null);
    } catch (e) {
      lastError = e;
      failedMonths.push(ym);
      return [];
    }
  });
  if (failedMonths.length === months.length) {
    throw lastError instanceof Error ? lastError : new Error("실거래가 API 조회에 실패했습니다.");
  }
  return { rows: perMonth.flat(), failedMonths: failedMonths.sort() };
}

export function fetchTrades(lawd: string, months: string[]) {
  return fetchMonths("trade", lawd, months, toTrade);
}

export function fetchRents(lawd: string, months: string[]) {
  return fetchMonths("rent", lawd, months, toRent);
}
