// 분양 탭 좌측: 서울·경기 줍줍(무순위·임의공급) + 주목 분양 (청약예정·접수중) 최대 10개
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import { getHotPresales } from "@/lib/presale";

const md = (d: string) => (d ? d.slice(5).replace("-", ".") : "");
const shortAddr = (a: string) => a.split(/\s+/).slice(0, 3).join(" ");

export default async function HotPresales() {
  let data: Awaited<ReturnType<typeof getHotPresales>> | null = null;
  let error: string | null = null;
  try {
    data = await getHotPresales(10);
  } catch (e) {
    error = e instanceof Error ? e.message : "조회 실패";
  }
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <h2 className="bg-navy px-3 py-2 text-sm font-bold text-white">
        줍줍 · 주목 분양 <span className="font-normal text-slate-300">(서울·경기)</span>
      </h2>
      {error && <p className="p-3 text-xs text-red-600">{error}</p>}
      {data?.demo && <p className="px-3 pt-2 text-[11px] text-amber-700">데모 데이터</p>}
      {data && data.items.length === 0 && <p className="p-3 text-xs text-slate-500">현재 청약예정·접수중인 공고가 없습니다.</p>}
      <ol className="divide-y divide-slate-100">
        {data?.items.map((a, i) => (
          <li key={`${a.kind}:${a.houseManageNo}`}>
            <Link
              href={`/presale/${a.houseManageNo}${a.kind === "apt" ? "" : `?kind=${a.kind}`}`}
              className="flex gap-2 px-3 py-2 active:bg-slate-50"
            >
              <span className="w-4 shrink-0 pt-0.5 text-xs font-bold text-accent">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <span className="truncate text-sm font-semibold">{a.name}</span>
                  <StatusBadge status={a.status} />
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {shortAddr(a.address)} · {a.households.toLocaleString("ko-KR")}세대
                  {a.receiptStart && ` · 접수 ${md(a.receiptStart)}${a.receiptEnd && a.receiptEnd !== a.receiptStart ? `~${md(a.receiptEnd)}` : ""}`}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {a.reasons.map((r) => (
                    <span
                      key={r}
                      className={`rounded px-1 py-px text-[10px] font-semibold ${r.startsWith("줍줍") || r === "임의공급" || r.includes("재공급") ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
      <p className="px-3 py-1.5 text-[10px] text-slate-400">최근 90일 공고 중 청약예정·접수중. 무순위·임의공급 우선, 분양가상한제·서울·대단지 순.</p>
    </section>
  );
}
