// 서울·경기 급등·급락 단지 목록 생성 → src/data/hot-trades.json
// 실행: DATA_GO_KR_KEY=... npm run hot:build   (GitHub Actions에서 매일 아침 실행)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeHotTrades, type HotTradesFile } from "../src/lib/hot";
import { fetchTrades, recentMonths, type TradeRow } from "../src/lib/molit";
import { PROVINCES } from "../src/lib/regions";

async function main() {
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
    }
  }
  if (byLawd.length < targets.length / 2) throw new Error(`조회 실패 지역이 너무 많음 (${failed.length}/${targets.length})`);
  const { up, down } = computeHotTrades(byLawd, months);
  const out: HotTradesFile = {
    generatedAt: new Date().toISOString(),
    basis: `${months[6].slice(0, 4)}.${months[6].slice(4)}~${months[8].slice(0, 4)}.${months[8].slice(4)} vs 직전 6개월 (같은 단지·평형 중위가, 직거래 제외)`,
    up,
    down,
    failed,
  };
  writeFileSync(join(process.cwd(), "src/data/hot-trades.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`급등 ${up.length} / 급락 ${down.length}, 실패 ${failed.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
