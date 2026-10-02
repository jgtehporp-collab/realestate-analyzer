// 서울·경기 급등·급락 단지 목록 생성 → src/data/hot-trades.json
// 실행: DATA_GO_KR_KEY=... npm run hot:build   (GitHub Actions에서 매일 아침 실행)
// HOT_SOURCE_URL(배포 주소) + HOT_BUILD_SECRET이 있으면 Vercel 서울 리전 프록시(/api/internal/trades)로 조회 —
// 공공데이터포털이 해외망(GitHub 러너) 접속을 막을 때 대비. 없으면 공공데이터포털 직접 호출.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeHotTrades, type HotTradesFile } from "../src/lib/hot";
import { attachOfficial, computeRegionStats, type PopRowLike, type RebRowLike, type RegionStatsFile } from "../src/lib/regionStats";
import { fetchKosisPopulation, fetchRebWeekly, weekId } from "../src/lib/officialStats";
import { fetchTrades, recentMonths, type TradeRow } from "../src/lib/molit";
import { isSplitDistrict, PROVINCES } from "../src/lib/regions";

const OUT = join(process.cwd(), "src/data/hot-trades.json");
const OUT_REGIONS = join(process.cwd(), "src/data/region-stats.json");

type Center = { lat: number; lng: number } | null;
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
/** 앞쪽 지역이 이 개수만큼 연속 실패하면 서버 장애로 보고 즉시 중단 (30분 동안 매달리지 않도록) */
const FAIL_FAST = 4;

const PROXY = process.env.HOT_SOURCE_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HOT_BUILD_SECRET?.trim();

async function fetchDistrict(lawd: string, months: string[]): Promise<{ rows: TradeRow[]; failedMonths: string[]; center?: Center; codes?: string[] }> {
  if (!PROXY || !SECRET) return fetchTrades(lawd, months);
  const url = `${PROXY}/api/internal/trades?lawd=${lawd}&months=${months.join(",")}&center=1`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(90_000) });
      const body = await res.json();
      if (!res.ok) throw new Error(`프록시 HTTP ${res.status}: ${body?.error ?? ""}`);
      return body;
    } catch (e) {
      // 401은 비밀값 불일치라 재시도해도 소용없음
      if (attempt >= 2 || (e instanceof Error && e.message.includes("HTTP 401"))) throw e;
    }
  }
}

/** 공식 통계(R-ONE·KOSIS): 프록시가 있으면 프록시로, 없으면 직접(REB_KEY·KOSIS_API_KEY 필요). 실패해도 계속 진행 */
async function fetchOfficial<T>(query: string, direct: () => Promise<T[]>, label: string): Promise<T[] | null> {
  try {
    if (PROXY && SECRET) {
      const res = await fetch(`${PROXY}/api/internal/stats?${query}`, {
        headers: { authorization: `Bearer ${SECRET}` },
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(`프록시 HTTP ${res.status}: ${body?.error ?? ""}`);
      return body.rows as T[];
    }
    return await direct();
  } catch (e) {
    console.error(`${label} 실패 (지도에서 해당 지표 생략):`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * 분석 9개월 (오래된 순, 뒤 3개월 = 최근). 실거래 신고는 계약 후 30일 이내라 월초에는 이번 달 거래가 거의 없어
 * "최근 3개월"이 사실상 2개월이 되므로, KST 10일 이전에는 이번 달을 빼고 지난달까지로 잡음.
 */
function analysisMonths(now = new Date()): string[] {
  const day = new Date(now.getTime() + 9 * 3600e3).getUTCDate();
  return day <= 10 ? recentMonths(10, now).slice(0, 9) : recentMonths(9, now);
}

async function main() {
  // 하루 여러 번 예약 실행되므로, 오늘 이미 갱신됐으면 건너뜀 (수동 실행은 FORCE=1)
  if (!process.env.FORCE) {
    try {
      const prev = JSON.parse(readFileSync(OUT, "utf8")) as HotTradesFile;
      if (prev.generatedAt && kstDate(new Date(prev.generatedAt)) === kstDate(new Date())) {
        console.log(`오늘(${kstDate(new Date())}) 이미 갱신됨 - 건너뜀`);
        return;
      }
    } catch {
      // 파일 없음/손상 → 새로 생성
    }
  }
  const months = analysisMonths();
  console.log(`조회 경로: ${PROXY && SECRET ? `Vercel 프록시 (${PROXY})` : "공공데이터포털 직접"}, 기간 ${months[0]}~${months[8]}`);
  const targets = PROVINCES.slice(0, 2).flatMap((p) => p.districts.map((d) => ({ lawd: d.code, region: `${p.short} ${d.name}` })));
  const byLawd: { lawd: string; region: string; rows: TradeRow[]; center: Center }[] = [];
  // 지도 좌표는 이전 파일 값을 재사용 (프록시에서 새로 못 받아도 유지)
  const prevCenters = new Map<string, Center>();
  try {
    for (const r of (JSON.parse(readFileSync(OUT_REGIONS, "utf8")) as RegionStatsFile).regions) {
      if (r.lat !== null && r.lng !== null) prevCenters.set(r.lawd, { lat: r.lat, lng: r.lng });
    }
  } catch {
    // 없음
  }
  const failed: string[] = [];
  for (const t of targets) {
    try {
      const { rows, failedMonths, center, codes } = await fetchDistrict(t.lawd, months);
      if (failedMonths.length) failed.push(`${t.region}(${failedMonths.join(",")})`);
      byLawd.push({ ...t, rows, center: center ?? prevCenters.get(t.lawd) ?? null });
      console.log(`${t.region}: ${rows.length}건`);
      if (isSplitDistrict(t.lawd)) {
        // 분구 지역 코드 검증용: 조회 코드·월별 건수 (최근 달이 0이면 신규 구 코드 확인 실패)
        const byMonth = months.map((m) => `${m.slice(4)}월 ${rows.filter((r) => r.ym === m).length}`);
        console.log(`  ↳ ${t.region} 코드 ${codes?.join("/") ?? "?"} 월별: ${byMonth.join(", ")}`);
      }
    } catch (e) {
      failed.push(t.region);
      console.error(`${t.region} 실패:`, e instanceof Error ? e.message : e);
      if (byLawd.length === 0 && failed.length >= FAIL_FAST) {
        throw new Error(
          `${PROXY && SECRET ? "Vercel 프록시" : "공공데이터포털(apis.data.go.kr)"} 조회 불가 - 첫 ${FAIL_FAST}개 지역 연속 실패, 다음 예약 실행에서 재시도`,
        );
      }
    }
  }
  if (byLawd.length < targets.length / 2) throw new Error(`조회 실패 지역이 너무 많음 (${failed.length}/${targets.length})`);
  const { up, down } = computeHotTrades(byLawd, months);
  const out: HotTradesFile = {
    generatedAt: new Date().toISOString(),
    basis: `${months[6].slice(0, 4)}.${months[6].slice(4)}~${months[8].slice(0, 4)}.${months[8].slice(4)} vs 직전 6개월 (같은 단지·평형 중위가, 직거래·1층·도시형생활주택 제외)`,
    up,
    down,
    failed,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  const { regions, zones } = computeRegionStats(byLawd, months);
  const now = new Date(Date.now() + 9 * 3600e3);
  const startWeek = weekId(new Date(now.getTime() - 30 * 7 * 86400e3));
  const endWeek = weekId(now);
  const reb = await fetchOfficial<RebRowLike>(`src=reb&start=${startWeek}&end=${endWeek}`, () => fetchRebWeekly(startWeek, endWeek), "R-ONE 주간지수");
  const pop = await fetchOfficial<PopRowLike>("src=kosis", () => fetchKosisPopulation(), "KOSIS 인구");
  attachOfficial(regions, zones, reb, pop);
  console.log(
    `R-ONE: ${reb ? `${reb.length}행, 매칭 ${regions.filter((r) => r.reb).length}/${regions.length}곳` : "없음"} / ` +
      `KOSIS: ${pop ? `${pop.length}행, 매칭 ${regions.filter((r) => r.pop).length}/${regions.length}곳` : "없음"}`,
  );
  const unmatched = regions.filter((r) => reb && !r.reb).map((r) => r.region);
  if (unmatched.length) console.log("R-ONE 미매칭:", unmatched.join(", "), "| 예시 행:", JSON.stringify(reb?.slice(0, 3)));
  const unmatchedPop = regions.filter((r) => pop && !r.pop).map((r) => r.region);
  if (unmatchedPop.length) console.log("KOSIS 미매칭:", unmatchedPop.join(", "), "| 예시 행:", JSON.stringify(pop?.slice(0, 3)));
  const regionOut: RegionStatsFile = {
    generatedAt: out.generatedAt,
    months,
    basis: `최근 3개월(${months[6].slice(2, 4)}.${months[6].slice(4)}~${months[8].slice(2, 4)}.${months[8].slice(4)}) vs 직전 6개월, 전용 84㎡ 환산 중위가`,
    regions,
    zones,
  };
  writeFileSync(OUT_REGIONS, JSON.stringify(regionOut) + "\n");
  console.log(`지역 통계 ${regions.length}곳 (좌표 ${regions.filter((r) => r.lat !== null).length}곳), 생활권 ${zones.length}개`);
  console.log(`급등 ${up.length} / 급락 ${down.length}, 실패 ${failed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
