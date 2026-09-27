// 매매 탭 좌측: 서울·경기 급등·급락 단지 (매일 아침 GitHub Actions가 src/data/hot-trades.json 갱신)
import Link from "next/link";
import hot from "@/data/hot-trades.json";
import type { HotTrade, HotTradesFile } from "@/lib/hot";
import { formatEok, formatPct } from "@/lib/format";

const data = hot as HotTradesFile;

function List({ title, items, color }: { title: string; items: HotTrade[]; color: string }) {
  return (
    <div>
      <h3 className={`px-3 pt-2 text-xs font-bold ${color}`}>{title}</h3>
      {items.length === 0 && <p className="px-3 py-1 text-[11px] text-slate-400">해당 단지 없음</p>}
      <ol>
        {items.map((x, i) => (
          <li key={x.id + x.band}>
            <Link href={`/report?lawd=${x.lawd}&id=${encodeURIComponent(x.id)}`} className="flex gap-2 px-3 py-1.5 active:bg-slate-50">
              <span className="w-4 shrink-0 pt-0.5 text-xs font-bold text-slate-400">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="truncate text-sm font-semibold">{x.aptNm}</span>
                  <span className={`shrink-0 text-sm font-bold ${color}`}>{formatPct(x.change, 1, true)}</span>
                </div>
                <div className="flex justify-between gap-1 text-[11px] text-slate-500">
                  <span className="truncate">
                    {x.region} {x.umdNm} · {x.band}
                    {x.newHigh && <span className="ml-1 rounded bg-red-50 px-1 font-semibold text-red-600">신고가</span>}
                  </span>
                  <span className="shrink-0">
                    {formatEok(x.baseMedian)} → {formatEok(x.recentMedian)}
                  </span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function HotTrades() {
  const updated = data.generatedAt
    ? new Date(new Date(data.generatedAt).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ")
    : null;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <h2 className="bg-navy px-3 py-2 text-sm font-bold text-white">
        급등 · 급락 단지 <span className="font-normal text-slate-300">(서울·경기)</span>
      </h2>
      {!updated ? (
        <p className="p-3 text-xs text-slate-500">아직 생성 전입니다. 매일 아침 자동 갱신됩니다 (GitHub Actions에 DATA_GO_KR_KEY 시크릿 필요).</p>
      ) : (
        <>
          <List title="▲ 급등" items={data.up} color="text-red-600" />
          <List title="▼ 급락" items={data.down} color="text-blue-600" />
          <p className="px-3 py-1.5 text-[10px] leading-snug text-slate-400">
            {data.basis}. 최근 2건·이전 3건 이상 거래 단지, 변동 ±3% 초과. 갱신 {updated} (KST)
          </p>
        </>
      )}
    </section>
  );
}
