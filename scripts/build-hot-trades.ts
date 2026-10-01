// 서울·경기 급등·급락 단지 목록 생성 → src/data/hot-trades.json
// 실행: DATA_GO_KR_KEY=... npm run hot:build   (GitHub Actions에서 매일 아침 실행)
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeHotTrades, type HotTradesFile } from "../src/lib/hot";
import { fetchTrades, recentMonths, type TradeRow } from "../src/lib/molit";
import { PROVINCES } from "../src/lib/regions";

const OUT = join(process.cwd(), "src/data/hot-trades.json");
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
/** 앞쪽 지역이 이 개수만큼 연속 실패하면 서버 장애로 보고 즉시 중단 (30분 동안 매달리지 않도록) */
const FAIL_FAST = 4;

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
  const months = recentMonths(9);
  const targets = PROVINCES.slice(0, 2).flatMap((p) => p.districts.map((d) => ({ lawd: d.code, region: `${p.short} ${d.name}` })));
  const byLawd: { lawd: string; region: string; rows: TradeRow[] }[] = [];
  const failed: string[] = [];
  for (const t of targets) {
    try {
      const { rows, failedMonths } = await fetchTrades(t.lawd, months);
      if (failedMonths.length) failed.push(`${t.region}(${failedMonths.join(",")})`);
      byLawd.push({ ...t, rows });
      console.log(`${t.region}: ${rows.length}건`);
    } catch (e) {
      failed.push(t.region);
      console.error(`${t.region} 실패:`, e instanceof Error ? e.message : e);
      if (byLawd.length === 0 && failed.length >= FAIL_FAST) {
        throw new Error(`공공데이터포털(apis.data.go.kr) 접속 불가 - 첫 ${FAIL_FAST}개 지역 연속 실패, 다음 예약 실행에서 재시도`);
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
