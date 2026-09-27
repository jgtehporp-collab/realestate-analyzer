import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import HotPresales from "@/components/HotPresales";
import RegionPicker from "@/components/RegionPicker";
import StatusBadge from "@/components/StatusBadge";
import { getPresaleList } from "@/lib/presale";
import { findRegion, PROVINCES } from "@/lib/regions";

export const metadata: Metadata = { title: "분양 | 부동산 분석" };

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const md = (d: string) => (d ? d.slice(5).replace("-", ".") : "—");

export default async function PresalePage({ searchParams }: Props) {
  const sp = await searchParams;
  const province = PROVINCES.some((p) => p.name === one(sp.province)) ? one(sp.province) : null;
  const lawd = one(sp.lawd) && findRegion(one(sp.lawd)) ? one(sp.lawd) : null;

  let result: Awaited<ReturnType<typeof getPresaleList>> | null = null;
  let error: string | null = null;
  if (province) {
    try {
      result = await getPresaleList(province, lawd);
    } catch (e) {
      error = e instanceof Error ? e.message : "조회 실패";
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 lg:grid-cols-[320px_1fr]">
      <aside className="lg:sticky lg:top-16 lg:self-start">
        <Suspense
          fallback={<div className="rounded-xl bg-white p-4 text-xs text-slate-500 shadow-sm">줍줍 · 주목 분양 불러오는 중…</div>}
        >
          <HotPresales />
        </Suspense>
      </aside>
      <div className="min-w-0">
      <h1 className="text-xl font-bold">분양 · 청약</h1>
      <p className="mt-1 text-sm text-slate-600">청약홈 APT 분양공고(최근 12개월·예정)와 주택형별 분양가·경쟁률, 인근 신축 실거래 대비 안전마진을 봅니다.</p>
      <div className="mt-4">
        <RegionPicker province={province} lawd={lawd} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
          <br />
          <span className="text-xs">공공데이터포털에서 &quot;한국부동산원_청약홈 분양정보 조회 서비스&quot; 활용신청이 되어 있는지 확인해 주세요.</span>
        </p>
      )}
      {result?.demo && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">데모 데이터입니다. DATA_GO_KR_KEY를 설정하면 청약홈 실제 공고를 보여줍니다.</p>
      )}

      {result && (
        <section className="mt-5">
          <h2 className="text-sm font-bold text-slate-700">
            {result.label} 분양공고 {result.items.length}건
          </h2>
          {result.items.length === 0 && <p className="mt-2 text-sm text-slate-500">최근 12개월 내 APT 분양공고가 없습니다.</p>}
          <ul className="mt-2 space-y-2">
            {result.items.map((a) => (
              <li key={a.houseManageNo}>
                <Link href={`/presale/${a.houseManageNo}`} className="block rounded-xl bg-white p-4 shadow-sm active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold">{a.name}</div>
                    <StatusBadge status={a.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{a.address}</div>
                  <div className="mt-2 text-xs text-slate-700">
                    공급 {a.households.toLocaleString("ko-KR")}세대 · 공고 {md(a.noticeDate)} · 특공 {md(a.specialStart)} · 1순위 {md(a.rank1Local || a.receiptStart)} · 발표 {md(a.winnerDate)}
                    {a.moveIn && ` · 입주 ${a.moveIn.slice(0, 4)}.${a.moveIn.slice(4, 6)}`}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1 text-[11px]">
                    {a.priceCap && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">분양가상한제</span>}
                    {a.overheated && <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700">투기과열지구</span>}
                    {a.adjusted && <span className="rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">조정대상지역</span>}
                    {a.redevelopment && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">정비사업</span>}
                    {a.publicZone && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">공공주택지구</span>}
                    {a.saleType && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{a.saleType}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
    </div>
  );
}
