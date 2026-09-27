import type { Metadata } from "next";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatEok, formatPct } from "@/lib/format";
import { getPresaleDetail, type ModelRow, type PresaleDetail } from "@/lib/presale";

export const maxDuration = 60;
export const metadata: Metadata = { title: "분양 상세 | 부동산 분석" };

const dot = (d: string) => (d ? d.replaceAll("-", ".") : "—");
const range = (a: string, b: string) => (a ? (b && b !== a ? `${dot(a)} ~ ${dot(b).slice(5)}` : dot(a)) : "—");

export default async function PresaleDetailPage({ params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;
  let detail: PresaleDetail | null = null;
  let error: string | null = null;
  try {
    detail = await getPresaleDetail(decodeURIComponent(no));
  } catch (e) {
    error = e instanceof Error ? e.message : "조회 실패";
  }
  if (!detail) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-slate-600">{error ?? "분양공고를 찾지 못했습니다."}</p>
        <Link href="/presale" className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">
          분양 목록
        </Link>
      </div>
    );
  }

  const a = detail.announcement;
  const models = detail.models;
  const totalGeneral = models.reduce((s, m) => s + m.general, 0);
  const totalSpecial = models.reduce((s, m) => s + m.special, 0);
  const withMargin = models.filter((m) => m.marginPct !== null);
  const best = withMargin.reduce<ModelRow | null>((x, m) => (!x || (m.marginPct ?? -9) > (x.marginPct ?? -9) ? m : x), null);
  const main = [...models].sort((x, y) => y.general + y.special - (x.general + x.special))[0];

  const flags = [
    a.priceCap && "분양가상한제",
    a.overheated && "투기과열지구",
    a.adjusted && "조정대상지역",
    a.redevelopment && "정비사업",
    a.publicZone && "공공주택지구",
  ].filter(Boolean) as string[];

  const summary: string[] = [];
  if (best?.market && best.marginPct !== null) {
    const detailText = `${best.houseType}(전용 ${best.area}㎡) 분양가 ${formatEok(best.topPrice)} vs 인근 신축 ${formatEok(best.market.median)} → ${best.margin! >= 0 ? "+" : ""}${formatEok(best.margin)} (${formatPct(best.marginPct, 0, true)})`;
    summary.push(
      best.margin! >= 0
        ? `안전마진이 가장 큰 주택형: ${detailText}.`
        : `모든 주택형이 인근 신축 시세보다 높음. 차이가 가장 작은 주택형: ${detailText}. 입지·브랜드 프리미엄을 감안해 판단 필요.`,
    );
  } else if (models.length) {
    summary.push("인근 신축 실거래가 부족해 안전마진을 계산하지 못했습니다.");
  }
  if (a.priceCap) summary.push("분양가상한제 적용 단지로 전매제한·실거주 의무 여부를 공고문에서 확인하세요.");
  const cmp = models.filter((m) => m.competition);
  if (cmp.length) {
    const top = cmp.reduce((x, m) => (parseFloat(m.competition!.rate) > parseFloat(x.competition!.rate) ? m : x));
    summary.push(`1순위 해당지역 최고 경쟁률 ${top.houseType} ${top.competition!.rate}:1.`);
  }
  const scored = models.filter((m) => m.score);
  if (scored.length) summary.push(`당첨가점(해당지역) 최저 ${Math.min(...scored.map((m) => m.score!.low))}점 ~ 최고 ${Math.max(...scored.map((m) => m.score!.high))}점.`);

  return (
    <div className="mx-auto max-w-[1200px] p-2 lg:p-3">
      <div className="no-print mb-2 flex items-center justify-between">
        <Link href="/presale" className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold shadow-sm">
          ← 분양 목록
        </Link>
        {a.url && (
          <a href={a.url} target="_blank" rel="noreferrer" className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
            청약홈 공고
          </a>
        )}
      </div>
      {detail.demo && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">데모 데이터입니다.</p>}

      <div className="overflow-hidden rounded-sm shadow">
        <header className="flex flex-wrap items-end justify-between gap-x-4 border-b-4 border-accent bg-navy px-4 py-2 text-white">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{a.name}</h1>
              <StatusBadge status={a.status} />
            </div>
            <p className="text-xs text-slate-300">{a.address}</p>
          </div>
          <p className="text-sm text-slate-200">
            {[
              `공급 ${a.households.toLocaleString("ko-KR")}세대`,
              totalGeneral + totalSpecial ? `일반 ${totalGeneral} · 특별 ${totalSpecial}` : null,
              a.moveIn && `입주예정 ${a.moveIn.slice(0, 4)}.${a.moveIn.slice(4, 6)}`,
              a.builder && `시공 ${a.builder}`,
            ]
              .filter(Boolean)
              .join("  |  ")}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-2 bg-slate-200 p-2 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2">
            <section className="overflow-hidden rounded-sm bg-white shadow-sm">
              <h3 className="bg-navy px-3 py-1 text-[13px] font-bold text-white">청약 일정</h3>
              {[
                ["모집공고", dot(a.noticeDate)],
                ["특별공급", range(a.specialStart, a.specialEnd)],
                ["1순위 해당지역", dot(a.rank1Local)],
                ["일반 접수", range(a.receiptStart, a.receiptEnd)],
                ["당첨자 발표", dot(a.winnerDate)],
                ["계약", range(a.contractStart, a.contractEnd)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-xs last:border-0">
                  <span className="text-slate-600">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </section>
            <section className="overflow-hidden rounded-sm bg-white shadow-sm">
              <h3 className="bg-navy px-3 py-1 text-[13px] font-bold text-white">규제 · 사업</h3>
              <div className="flex flex-wrap gap-1 px-3 py-2 text-[11px]">
                {flags.length ? flags.map((f) => <span key={f} className="rounded bg-orange-50 px-1.5 py-0.5 font-semibold text-orange-700">{f}</span>) : <span className="text-slate-400">해당 없음</span>}
              </div>
              <div className="px-3 pb-2 text-xs text-slate-600">
                {a.saleType && <div>구분: {a.houseType} · {a.saleType}</div>}
                {a.developer && <div>시행: {a.developer}</div>}
                {a.builder && <div>시공: {a.builder}</div>}
              </div>
            </section>
            <section className="flex-1 overflow-hidden rounded-sm bg-white shadow-sm">
              <div className="h-3 bg-blue-600" />
              <div className="px-3 py-2">
                <h4 className="text-sm font-bold">투자생각</h4>
                <p className="mt-1 text-xs leading-relaxed text-slate-700">{summary.join(" ") || "—"}</p>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-2">
            <section className="overflow-x-auto rounded-sm bg-white shadow-sm">
              <h3 className="bg-navy px-3 py-1 text-[13px] font-bold text-white">주택형별 분양가 · 경쟁률 · 안전마진</h3>
              {models.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">주택형 정보가 없습니다.</p>
              ) : (
                <table className="w-full min-w-[640px] border-collapse text-center text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      {["주택형", "공급(일반/특별)", "분양가(최고)", "1순위 해당 경쟁률", "당첨가점 최저/평균", "인근 신축 시세", "안전마진"].map((h) => (
                        <th key={h} className="border border-slate-200 px-2 py-1.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.modelNo} className={m === main ? "bg-orange-50/50" : ""}>
                        <td className="border border-slate-200 px-2 py-1.5 font-bold">
                          {m.houseType}
                          <div className="text-[10px] font-normal text-slate-500">전용 {m.area}㎡</div>
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5">
                          {m.general} / {m.special}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 font-semibold">{formatEok(m.topPrice || null)}</td>
                        <td className="border border-slate-200 px-2 py-1.5">{m.competition ? `${m.competition.rate}:1` : "—"}</td>
                        <td className="border border-slate-200 px-2 py-1.5">{m.score ? `${m.score.low} / ${m.score.avg}` : "—"}</td>
                        <td className="border border-slate-200 px-2 py-1.5">
                          {m.market ? (
                            <>
                              {formatEok(m.market.median)}
                              <div className="text-[10px] text-slate-500">{m.market.count}건</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={`border border-slate-200 px-2 py-1.5 font-bold ${m.margin === null ? "" : m.margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {m.margin === null ? (
                            "—"
                          ) : (
                            <>
                              {m.margin >= 0 ? "+" : ""}
                              {formatEok(m.margin)}
                              <div className="text-[10px]">{formatPct(m.marginPct, 0, true)}</div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="px-3 py-1.5 text-[10px] text-slate-500">
                인근 신축 시세: 같은 구 최근 12개월 실거래 중 입주 5년 이내(부족하면 10년)·전용 ±5㎡ 거래의 중위가격. 분양가는 주택형 최고가 기준. 경쟁률·가점은 발표 후 표시.
              </p>
            </section>

            <section className="overflow-hidden rounded-sm bg-white shadow-sm">
              <h3 className="bg-navy px-3 py-1 text-[13px] font-bold text-white">비교 단지 (인근 신축 실거래)</h3>
              {models.some((m) => m.market?.comparables.length) ? (
                <div className="grid gap-px bg-slate-200 sm:grid-cols-2">
                  {models
                    .filter((m) => m.market?.comparables.length)
                    .map((m) => (
                      <div key={m.modelNo} className="bg-white px-3 py-2 text-xs">
                        <div className="font-bold">
                          {m.houseType} <span className="font-normal text-slate-500">({m.market!.basis})</span>
                        </div>
                        {m.market!.comparables.map((c) => (
                          <div key={c.aptNm} className="mt-0.5 flex justify-between">
                            <span>
                              {c.aptNm} <span className="text-slate-400">{c.buildYear}년</span>
                            </span>
                            <span className="font-semibold">
                              {formatEok(c.median)} <span className="font-normal text-slate-400">({c.count}건)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="p-3 text-xs text-slate-500">비교할 인근 신축 거래가 없습니다.</p>
              )}
            </section>
            {detail.errors.length > 0 && (
              <p className="px-1 text-[10px] text-slate-500">일부 정보 조회 실패: {detail.errors.join(" / ")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
