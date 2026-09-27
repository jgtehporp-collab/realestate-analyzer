// 페이지/API 라우트가 쓰는 진입점. API 키가 없으면 데모 데이터로 대체.
import "server-only";
import { buildReport, complexId, searchComplexes, type Complex, type ExtraStatus, type Extras, type PeriodMode, type Report } from "./analysis";
import { demoPois, demoRows } from "./demo";
import { getBuildingInfo, getKaptInfo } from "./kapt";
import { envGrade, getLocation, kakaoKey, schoolGrade, vworldKey, type PoiType } from "./location";
import { fetchRents, fetchTrades, getServiceKey, recentMonths } from "./molit";
import { findRegion, regionLabel } from "./regions";

export const ANALYSIS_MONTHS = 24;
export const EXTENDED_MONTHS = 36;
/** 자동 모드에서 가장 거래가 많은 평형대의 매매가 이 건수 미만이면 36개월로 확장 (2개월에 1건 미만) */
const SPARSE_TRADES = 12;

const isSparse = (r: Report) => Math.max(0, ...r.bands.map((b) => b.tradeCount)) < SPARSE_TRADES;
const SEARCH_MONTHS = 12;

export const isDemo = () => !getServiceKey();

/** 홈 화면에 보여줄 데이터 연결 상태 */
export function connectionStatus() {
  return {
    dataGoKr: !!getServiceKey(),
    vworld: !!vworldKey(),
    kakao: !!kakaoKey(),
  };
}

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

export async function getReport(lawd: string, id: string, mode: PeriodMode = "auto"): Promise<Report | null> {
  if (!findRegion(lawd)) throw new Error("지원하지 않는 지역 코드입니다.");
  const first = mode === "36" ? EXTENDED_MONTHS : ANALYSIS_MONTHS;
  let report = await buildForPeriod(lawd, id, first);
  let extended = false;
  if (report && mode === "auto" && isSparse(report)) {
    // 이미 받은 24개월은 캐시에서 재사용되고 앞쪽 12개월만 추가 조회
    const longer = await buildForPeriod(lawd, id, EXTENDED_MONTHS);
    if (longer) {
      report = longer;
      extended = true;
    }
  }
  if (!report) return null;
  report.period = { months: report.months.length, mode, extended };
  if (!report.demo) {
    report.extras = await loadExtras(report);
    decorate(report);
  }
  return report;
}

async function buildForPeriod(lawd: string, id: string, n: number): Promise<Report | null> {
  const months = recentMonths(n);
  const regionName = regionLabel(lawd);

  if (isDemo()) {
    const name = id.startsWith("demo:") ? id.slice(5) : "샘플아파트";
    const { trades, rents } = demoRows(lawd, name, months);
    const report = buildReport({ demo: true, lawd, regionName, id: complexId(trades[0]), months, trades, rents, failedMonths: [] });
    if (report) {
      const { lat, lng, pois } = demoPois(name);
      const counts: Partial<Record<PoiType, number>> = {};
      for (const p of pois) counts[p.type] = (counts[p.type] ?? 0) + 1;
      report.extras.location = { lat, lng, geocoder: "kakao", pois, counts, env: envGrade(pois, counts), school: schoolGrade(pois, counts) };
    }
    return report;
  }

  const [t, r] = await Promise.all([fetchTrades(lawd, months), fetchRents(lawd, months)]);
  const failedMonths = [...new Set([...t.failedMonths, ...r.failedMonths])].sort();
  return buildReport({ demo: false, lawd, regionName, id, months, trades: t.rows, rents: r.rows, failedMonths });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 부가정보(K-apt, 건축물대장, 좌표·주변시설). 개별 실패는 리포트 전체를 막지 않음. */
async function loadExtras(report: Report): Promise<Extras> {
  const { complex, lawd } = report;
  const status: Extras["status"] = {
    kapt: { state: "ok" },
    building: { state: "ok" },
    map: { state: vworldKey() || kakaoKey() ? "ok" : "nokey" },
    poi: { state: kakaoKey() ? "ok" : "nokey" },
  };

  const kapt = await getKaptInfo(lawd, complex.umdNm, complex.aptNm).catch((e) => {
    status.kapt = { state: "error", message: errMsg(e) };
    return null;
  });
  if (!kapt && status.kapt.state === "ok") status.kapt = { state: "notfound", message: "K-apt에서 일치하는 단지를 찾지 못함 (소규모·신규 단지일 수 있음)" };

  const fail = (target: ExtraStatus) => (e: unknown) => {
    target.state = "error";
    target.message = errMsg(e);
    return null;
  };

  if (!kapt) status.building = { state: "notfound", message: "K-apt 법정동코드가 있어야 조회 가능" };
  const [building, location] = await Promise.all([
    kapt
      ? getBuildingInfo(kapt.bjdCode, complex.jibun).catch(fail(status.building))
      : Promise.resolve(null),
    getLocation(complex.address, kapt?.roadAddress ?? undefined).catch((e) => {
      status.map = { state: "error", message: errMsg(e) };
      status.poi = { state: "error", message: errMsg(e) };
      return null;
    }),
  ]);
  if (!building && status.building.state === "ok") status.building = { state: "notfound" };
  if (!location && status.map.state === "ok") {
    status.map = { state: "notfound", message: "주소로 좌표를 찾지 못함" };
    if (status.poi.state === "ok") status.poi = { state: "notfound" };
  }
  return { kapt, building, location, status };
}

/** 부가정보로 태그·코멘트 보강 */
function decorate(report: Report) {
  const { kapt, location } = report.extras;
  const tags = report.tags;
  const extraValue: string[] = [];
  if (kapt?.households) {
    tags.unshift(`#${kapt.households.toLocaleString("ko-KR")}세대`);
    if (kapt.households >= 1000) tags.unshift("#대단지");
    extraValue.push(`${kapt.households.toLocaleString("ko-KR")}세대${kapt.dongCount ? `(${kapt.dongCount}개동)` : ""}`);
  }
  if (kapt?.hallType) tags.push(`#${kapt.hallType}`);
  if (kapt?.builder) extraValue.push(`시공 ${kapt.builder}`);
  if (kapt?.subway) extraValue.push(`${kapt.subway}${kapt.subwayWalk ? ` 도보 ${kapt.subwayWalk}` : ""}`);
  const st = location?.pois?.filter((p) => p.type === "subway").sort((a, b) => a.distance - b.distance)[0];
  if (st && st.distance <= 500) tags.push("#역세권");
  if (location?.school && (location.school.grade === "S" || location.school.grade === "A")) tags.push("#학군우수");
  if (extraValue.length) report.notes.value = `${extraValue.join(", ")}. ${report.notes.value}`;
}
