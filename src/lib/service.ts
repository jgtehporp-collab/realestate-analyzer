// 페이지/API 라우트가 쓰는 진입점. API 키가 없으면 데모 데이터로 대체.
import "server-only";
import { buildReport, complexId, searchComplexes, type Complex, type Report } from "./analysis";
import { demoRows } from "./demo";
import { fetchRents, fetchTrades, getServiceKey, recentMonths } from "./molit";
import { findRegion, regionLabel } from "./regions";

export const ANALYSIS_MONTHS = 24;
const SEARCH_MONTHS = 12;

export const isDemo = () => !getServiceKey();

export async function findComplexes(lawd: string, query: string): Promise<{ demo: boolean; complexes: Complex[] }> {
  if (!findRegion(lawd)) throw new Error("지원하지 않는 지역 코드입니다.");
  if (isDemo()) {
    const name = query.trim() || "샘플아파트";
    const { trades } = demoRows(lawd, name, recentMonths(SEARCH_MONTHS));
    return { demo: true, complexes: searchComplexes(trades, "").map((c) => ({ ...c, id: `demo:${name}` })) };
  }
  const { rows } = await fetchTrades(lawd, recentMonths(SEARCH_MONTHS));
  return { demo: false, complexes: searchComplexes(rows, query) };
}

export async function getReport(lawd: string, id: string): Promise<Report | null> {
  if (!findRegion(lawd)) throw new Error("지원하지 않는 지역 코드입니다.");
  const months = recentMonths(ANALYSIS_MONTHS);
  const regionName = regionLabel(lawd);

  if (isDemo()) {
    const name = id.startsWith("demo:") ? id.slice(5) : "샘플아파트";
    const { trades, rents } = demoRows(lawd, name, months);
    return buildReport({ demo: true, lawd, regionName, id: complexId(trades[0]), months, trades, rents, failedMonths: [] });
  }

  const [t, r] = await Promise.all([fetchTrades(lawd, months), fetchRents(lawd, months)]);
  const failedMonths = [...new Set([...t.failedMonths, ...r.failedMonths])].sort();
  return buildReport({ demo: false, lawd, regionName, id, months, trades: t.rows, rents: r.rows, failedMonths });
}
