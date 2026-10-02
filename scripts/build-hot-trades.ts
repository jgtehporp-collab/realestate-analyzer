// 서울·경기 급등·급락 단지 목록 생성 → src/data/hot-trades.json
// 실행: DATA_GO_KR_KEY=... npm run hot:build   (GitHub Actions에서 매일 아침 실행)
// HOT_SOURCE_URL(배포 주소) + HOT_BUILD_SECRET이 있으면 Vercel 서울 리전 프록시(/api/internal/trades)로 조회 —
// 공공데이터포털이 해외망(GitHub 러너) 접속을 막을 때 대비. 없으면 공공데이터포털 직접 호출.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeHotTrades, type HotTradesFile } from "../src/lib/hot";
import { fetchTrades, recentMonths, type TradeRow } from "../src/lib/molit";
import { PROVINCES } from "../src/lib/regions";

const OUT = join(process.cwd(), "src/data/hot-trades.json");
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
/** 앞쪽 지역이 이 개수만큼 연속 실패하면 서버 장애로 보고 즉시 중단 (30분 동안 매달리지 않도록) */
const FAIL_FAST = 4;

const PROXY = process.env.HOT_SOURCE_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HOT_BUILD_SECRET?.trim();

async function fetchDistrict(lawd: string, months: string[]): Promise<{ rows: TradeRow[]; failedMonths: string[] }> {
  if (!PROXY || !SECRET) return fetchTrades(lawd, months);
  const url = `${PROXY}/api/internal/trades?lawd=${lawd}&months=${months.join(",")}`;
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
  const byLawd: { lawd: string; region: string; rows: TradeRow[] }[] = [];
  const failed: string[] = [];
  for (const t of targets) {
    try {
      const { rows, failedMonths } = await fetchDistrict(t.lawd, months);
      if (failedMonths.length) failed.push(`${t.region}(${failedMonths.join(",")})`);
      byLawd.push({ ...t, rows });
      console.log(`${t.region}: ${rows.length}건`);
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
    basis: `${months[6].slice(0, 4)}.${months[6].slice(4)}~${months[8].slice(0, 4)}.${months[8].slice(4)} vs 직전 6개월 (같은 단지·평형 중위가, 직거래·1층 제외)`,
    up,
    down,
    failed,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`급등 ${up.length} / 급락 ${down.length}, 실패 ${failed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
