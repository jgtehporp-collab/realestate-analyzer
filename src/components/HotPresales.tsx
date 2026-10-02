// 분양 탭 좌측: 서울·경기 청약예정·접수중 중 줍줍(무순위·재공급·임의공급) / 주목 분양을 나눠 최대 10개
import Link from "next/link";
import StatusBadge from "./StatusBadge";
import TagBadge from "./TagBadge";
import { getHotPresales, type HotItem } from "@/lib/presale";

const md = (d: string) => (d ? d.slice(5).replace("-", ".") : "");
const shortAddr = (a: string) => a.split(/\s+/).slice(0, 3).join(" ");

const SECTIONS = [
  {
    tag: "zupzup" as const,
    title: "줍줍",
    desc: "무순위·재공급·임의공급 - 청약통장·가점 없이도 노려볼 수 있는 물량",
    tone: "border-violet-500 bg-violet-50",
  },
  {
    tag: "hot" as const,
    title: "주목 분양",
    desc: "분양가상한제(시세 대비 저렴)·1,000세대+ 대단지·서울 투기과열지구",
    tone: "border-amber-400 bg-amber-50",
  },
];

function Row({ a }: { a: HotItem }) {
  return (
    <li>
      <Link href={`/presale/${a.houseManageNo}${a.kind === "apt" ? "" : `?kind=${a.kind}`}`} className="block px-3 py-2 active:bg-slate-50">
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
            <span key={r} className="rounded bg-slate-100 px-1 py-px text-[10px] text-slate-600">
              {r}
            </span>
          ))}
        </div>
      </Link>
    </li>
  );
}

export default async function HotPresales() {
  let data: Awaited<ReturnType<typeof getHotPresales>> | null = null;
  let error: string | null = null;
  try {
    data = await getHotPresales(10);
  } catch (e) {
    error = e instanceof Error ? e.message : "조회 실패";
  }
  const others = data?.items.filter((a) => a.tag === null) ?? [];
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <h2 className="bg-navy px-3 py-2 text-sm font-bold text-white">
        줍줍 · 주목 분양 <span className="font-normal text-slate-300">(서울·경기)</span>
      </h2>
      {error && <p className="p-3 text-xs text-red-600">{error}</p>}
      {data?.demo && <p className="px-3 pt-2 text-[11px] text-amber-700">데모 데이터</p>}
      {data && data.items.length === 0 && <p className="p-3 text-xs text-slate-500">현재 청약예정·접수중인 공고가 없습니다.</p>}
      {data &&
        data.items.length > 0 &&
        SECTIONS.map((s) => {
          const list = data.items.filter((a) => a.tag === s.tag);
          return (
            <div key={s.tag}>
              <div className={`border-l-4 px-3 py-1.5 ${s.tone}`}>
                <div className="flex items-center gap-1.5">
                  <TagBadge tag={s.tag} />
                  <span className="text-xs font-bold text-slate-800">
                    {s.title} {list.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{s.desc}</p>
              </div>
              {list.length === 0 ? (
                <p className="px-3 py-2 text-[11px] text-slate-400">현재 해당 공고 없음</p>
              ) : (
                <ol className="divide-y divide-slate-100">
                  {list.map((a) => (
                    <Row key={`${a.kind}:${a.houseManageNo}`} a={a} />
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      {others.length > 0 && (
        <div>
          <div className="border-l-4 border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">기타 {others.length}</div>
          <ol className="divide-y divide-slate-100">
            {others.map((a) => (
              <Row key={`${a.kind}:${a.houseManageNo}`} a={a} />
            ))}
          </ol>
        </div>
      )}
      <p className="px-3 py-1.5 text-[10px] text-slate-400">최근 90일 공고 중 청약예정·접수중, 최대 10개. 지도에서 위치와 최근 3개월 완료 공고도 볼 수 있습니다.</p>
    </section>
  );
}
