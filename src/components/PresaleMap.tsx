"use client";
// 분양 탭 지도: 서울·경기·인천 청약예정·접수중(진행중) + 최근 3개월 내 접수 종료(완료) 공고.
// 줍줍(무순위·재공급·임의공급)은 보라, 주목 분양(상한제·대단지·서울 투기과열)은 노랑 배지로 구분.
// 대표 분양가(84㎡ 기준) 15억 이상은 검은 테두리·큰 라벨, 9억~15억은 남색 테두리로 강조. 완료 공고는 최종 경쟁률 표시.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { PresaleStatus, PresaleTag } from "@/lib/presale";
import StatusBadge from "./StatusBadge";
import TagBadge, { TAG_TEXT } from "./TagBadge";

export type PresalePin = {
  key: string;
  no: string;
  kind: string;
  kindLabel: string;
  name: string;
  address: string;
  status: PresaleStatus;
  group: "active" | "done";
  tag: PresaleTag;
  reasons: string[];
  households: number;
  noticeDate: string;
  receiptStart: string;
  receiptEnd: string;
  winnerDate: string;
  lat: number;
  lng: number;
  approx: boolean;
  price: { amount: number; area: number } | null; // 대표 분양가(만원), 84㎡에 가장 가까운 주택형
  cmpet: { rate: number; requests: number; supply: number; basis: string } | null; // 완료 공고 최종 경쟁률
};

type PriceTier = "high" | "mid" | null;
const priceTier = (p: PresalePin): PriceTier => (!p.price ? null : p.price.amount >= 150000 ? "high" : p.price.amount >= 90000 ? "mid" : null);
const TIER_LABEL = { high: "15억 이상", mid: "9억~15억" } as const;
const eok = (manwon: number) => `${(manwon / 10000).toFixed(manwon >= 100000 ? 1 : 2).replace(/\.?0+$/, "")}억`;
const rateText = (c: NonNullable<PresalePin["cmpet"]>) => (c.rate < 1 ? "미달" : `${c.rate >= 100 ? Math.round(c.rate) : c.rate.toFixed(1)}:1`);

type Area = "서울" | "경기" | "인천";
const AREAS: Area[] = ["서울", "경기", "인천"];
const AREA_VIEW: Record<Area, [[number, number], number]> = {
  서울: [[37.56, 126.98], 11],
  경기: [[37.4, 127.1], 9],
  인천: [[37.46, 126.68], 11],
};

const STATUS_COLOR: Record<PresaleStatus, string> = {
  접수중: "#dc2626",
  청약예정: "#f97316",
  발표대기: "#64748b",
  계약: "#64748b",
  완료: "#94a3b8",
};

const md = (d: string) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : "");
const shortAddr = (a: string) => a.split(/\s+/).slice(1, 3).join(" ");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const href = (p: PresalePin) => `/presale/${p.no}${p.kind === "apt" ? "" : `?kind=${p.kind}`}`;

function kstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

function dday(p: PresalePin, today: string): string {
  const diff = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86400e3);
  if (p.status === "청약예정" && p.receiptStart) {
    const n = diff(p.receiptStart);
    return n <= 0 ? "곧 접수" : `접수 D-${n}`;
  }
  if (p.status === "접수중" && p.receiptEnd) {
    const n = diff(p.receiptEnd);
    return n <= 0 ? "오늘 마감" : `마감 D-${n}`;
  }
  return "";
}

/** 줍줍·주목 우선, 접수 빠른 순 */
const rank = (p: PresalePin) => (p.tag === "zupzup" ? 0 : p.tag === "hot" ? 1 : 2);

export default function PresaleMap({
  items,
  demo,
  missing,
  vworldKey,
}: {
  items: PresalePin[];
  demo: boolean;
  missing: number;
  vworldKey: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [area, setArea] = useState<Area>(
    () => AREAS.find((a) => items.some((p) => p.group === "active" && p.address.startsWith(a))) ?? "서울",
  );
  const [showActive, setShowActive] = useState(true);
  const [showDone, setShowDone] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const today = kstToday();

  const inArea = useMemo(() => items.filter((p) => p.address.startsWith(area)), [items, area]);
  const visible = useMemo(
    () => inArea.filter((p) => (p.group === "active" ? showActive : showDone)),
    [inArea, showActive, showDone],
  );
  const activeList = useMemo(
    () =>
      inArea
        .filter((p) => p.group === "active")
        .sort((a, b) => rank(a) - rank(b) || (a.receiptStart || a.noticeDate).localeCompare(b.receiptStart || b.noticeDate)),
    [inArea],
  );
  const doneList = useMemo(
    () =>
      inArea
        .filter((p) => p.group === "done")
        .sort((a, b) => (b.winnerDate || b.receiptEnd || b.noticeDate).localeCompare(a.winnerDate || a.receiptEnd || a.noticeDate)),
    [inArea],
  );
  const doneCount = doneList.length;
  const sel = items.find((p) => p.key === selected) ?? null;

  // 지도 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      LRef.current = L;
      const map = L.map(ref.current, {
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
        zoomControl: true,
      }).setView([37.56, 126.98], 11);
      if (vworldKey) {
        L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Base/{z}/{y}/{x}.png`, {
          maxZoom: 19,
          minZoom: 7,
          attribution: "© VWorld",
        }).addTo(map);
      } else {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      }
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(ref.current);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [vworldKey]);

  // 마커: 진행중은 이름 라벨(상태 색 + 줍줍/주목 배지), 완료는 회색 점
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    // 완료를 먼저 그려 진행중 라벨이 위로 오게
    const ordered = [...visible].sort((a, b) => (a.group === b.group ? 0 : a.group === "done" ? -1 : 1));
    for (const p of ordered) {
      const active = p.key === selected;
      const tier = priceTier(p);
      const tierCls = tier ? ` pm-tier-${tier}` : "";
      const cls = `pm-label${tierCls}${p.approx ? " pm-approx" : ""}${active ? " pm-active" : ""}`;
      const badge = p.tag ? `<i class="pm-tag pm-${p.tag}">${TAG_TEXT[p.tag]}</i>` : "";
      const price = p.price ? `<i class="pm-price">${eok(p.price.amount)}</i>` : "";
      const html =
        p.group === "active"
          ? `<div class="${cls}" style="--c:${STATUS_COLOR[p.status]};background:var(--c)">${badge}<span>${esc(p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name)}</span>${price}</div>`
          : `<div class="pm-dot${tierCls}${p.tag ? ` pm-dot-${p.tag}` : ""}${active ? " pm-active" : ""}">${p.cmpet ? `<i class="pm-rate">${rateText(p.cmpet)}</i>` : ""}</div>`;
      const tierBoost = tier === "high" ? 300 : tier === "mid" ? 150 : 0;
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({ className: "", iconSize: [0, 0], html }),
        zIndexOffset: active ? 3000 : p.group === "active" ? 500 + (2 - rank(p)) * 100 + tierBoost : tierBoost,
        title: `${p.name}${p.price ? ` · 분양가 ${eok(p.price.amount)}` : ""}${p.cmpet ? ` · 경쟁률 ${rateText(p.cmpet)}` : ""}`,
      })
        .on("click", () => setSelected(p.key))
        .addTo(layer);
    }
  }, [ready, visible, selected]);

  // 서울/경기/인천 전환 시 해당 지역 공고에 화면 맞춤
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const pts = inArea.map((p) => [p.lat, p.lng] as [number, number]);
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 13 });
    else if (pts.length === 1) map.setView(pts[0], 13);
    else map.setView(...AREA_VIEW[area]);
  }, [ready, inArea, area]);

  function pick(p: PresalePin) {
    setSelected(p.key);
    mapRef.current?.panTo([p.lat, p.lng]);
  }

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2">
        <h2 className="text-sm font-bold text-white">
          수도권 분양 지도 <span className="font-normal text-slate-300">(청약홈 공고)</span>
        </h2>
        <div className="flex gap-1.5">
          <div className="flex overflow-hidden rounded-md bg-white/10 text-xs">
            {AREAS.map((a) => (
              <button
                key={a}
                onClick={() => {
                  setArea(a);
                  setSelected(null);
                }}
                className={`px-2.5 py-1 font-semibold ${area === a ? "bg-white text-navy" : "text-slate-200"}`}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-md bg-white/10 text-xs">
            <button
              onClick={() => setShowActive((v) => !v)}
              className={`px-2.5 py-1 font-semibold ${showActive ? "bg-accent text-white" : "text-slate-300 line-through"}`}
            >
              진행중 {activeList.length}
            </button>
            <button
              onClick={() => setShowDone((v) => !v)}
              className={`px-2.5 py-1 font-semibold ${showDone ? "bg-slate-500 text-white" : "text-slate-300 line-through"}`}
            >
              완료(3개월) {doneCount}
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_270px]">
        <div ref={ref} className="h-[360px] w-full bg-slate-100 lg:h-[520px]" />

        <aside className="max-h-[520px] overflow-y-auto border-t border-slate-100 p-3 text-xs lg:border-l lg:border-t-0">
          {sel ? (
            <div className="space-y-2">
              <button onClick={() => setSelected(null)} className="text-[11px] text-slate-400">
                ← 목록
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={sel.status} />
                  {sel.tag && <TagBadge tag={sel.tag} />}
                  {sel.kind !== "apt" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{sel.kindLabel}</span>}
                </div>
                <div className="mt-1 text-base font-bold leading-snug">{sel.name}</div>
                <div className="text-[11px] text-slate-500">{sel.address}</div>
                {sel.approx && <div className="text-[10px] text-amber-700">위치는 동 단위 추정 (정확한 주소 좌표 없음)</div>}
              </div>
              <dl className="grid grid-cols-[64px_1fr] gap-y-0.5 text-[11px]">
                <dt className="text-slate-500">공급</dt>
                <dd>{sel.households.toLocaleString("ko-KR")}세대</dd>
                <dt className="text-slate-500">모집공고</dt>
                <dd>{md(sel.noticeDate) || "—"}</dd>
                <dt className="text-slate-500">접수</dt>
                <dd>
                  {sel.receiptStart ? `${md(sel.receiptStart)}${sel.receiptEnd && sel.receiptEnd !== sel.receiptStart ? ` ~ ${md(sel.receiptEnd)}` : ""}` : "—"}
                  {dday(sel, today) && <b className="ml-1 text-red-600">{dday(sel, today)}</b>}
                </dd>
                <dt className="text-slate-500">당첨발표</dt>
                <dd>{md(sel.winnerDate) || "—"}</dd>
                <dt className="text-slate-500">대표 분양가</dt>
                <dd>
                  {sel.price ? (
                    <>
                      <b>{eok(sel.price.amount)}</b> <span className="text-slate-400">(전용 {sel.price.area}㎡ 최고가)</span>
                      {priceTier(sel) && <PriceBadge tier={priceTier(sel)!} />}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                {sel.group === "done" && (
                  <>
                    <dt className="text-slate-500">최종 경쟁률</dt>
                    <dd>
                      {sel.cmpet ? (
                        <>
                          <b className={sel.cmpet.rate < 1 ? "text-blue-600" : "text-red-600"}>{rateText(sel.cmpet)}</b>{" "}
                          <span className="text-slate-400">
                            ({sel.cmpet.basis}, 접수 {sel.cmpet.requests.toLocaleString("ko-KR")} / 공급 {sel.cmpet.supply.toLocaleString("ko-KR")})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">발표 전이거나 자료 없음</span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
              {sel.reasons.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sel.reasons.map((r) => (
                    <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                      {r}
                    </span>
                  ))}
                </div>
              )}
              <Link href={href(sel)} className="block w-full rounded-md bg-navy py-1.5 text-center font-semibold text-white">
                분양가·경쟁률·안전마진 보기
              </Link>
            </div>
          ) : (
            <div>
              <div className="mb-1 text-[11px] font-semibold text-slate-600">
                {area} 진행중 {activeList.length}건 <span className="font-normal text-slate-400">(줍줍·주목 우선)</span>
              </div>
              {activeList.length === 0 && <p className="text-slate-500">현재 청약예정·접수중인 공고가 없습니다.</p>}
              <ul className="divide-y divide-slate-100">
                {activeList.map((p) => (
                  <li key={p.key}>
                    <button onClick={() => pick(p)} className="w-full py-1.5 text-left">
                      <div className="flex items-center gap-1">
                        {p.tag && <TagBadge tag={p.tag} />}
                        <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="truncate text-[10px] text-slate-500">
                        {shortAddr(p.address)} · {p.households.toLocaleString("ko-KR")}세대
                        {p.price && <span className={priceTier(p) ? "font-bold text-slate-800" : ""}> · {eok(p.price.amount)}</span>}
                        {dday(p, today) && <b className="ml-1 text-red-600">{dday(p, today)}</b>}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {doneCount > 0 && (
                <>
                  <div className="mb-1 mt-3 text-[11px] font-semibold text-slate-600">
                    {area} 최근 완료 {doneCount}건 <span className="font-normal text-slate-400">(최종 경쟁률)</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {doneList.map((p) => (
                      <li key={p.key}>
                        <button onClick={() => pick(p)} className="flex w-full items-center gap-1 py-1 text-left">
                          {priceTier(p) && <PriceBadge tier={priceTier(p)!} />}
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          {p.price && <span className="shrink-0 text-[10px] text-slate-500">{eok(p.price.amount)}</span>}
                          <b className={`w-12 shrink-0 text-right ${p.cmpet && p.cmpet.rate < 1 ? "text-blue-600" : "text-red-600"}`}>
                            {p.cmpet ? rateText(p.cmpet) : "—"}
                          </b>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR.접수중 }} />
          접수중
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR.청약예정 }} />
          청약예정
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full border border-white bg-slate-400 shadow" />
          완료(3개월 내)
        </span>
        <span className="flex items-center gap-1">
          <TagBadge tag="zupzup" /> 무순위·재공급·임의공급
        </span>
        <span className="flex items-center gap-1">
          <TagBadge tag="hot" /> 상한제·대단지·서울 투기과열
        </span>
        <span className="flex items-center gap-1">
          <PriceBadge tier="high" /> 굵은 검은 테두리
        </span>
        <span className="flex items-center gap-1">
          <PriceBadge tier="mid" /> 남색 테두리 (대표 분양가, 84㎡ 기준)
        </span>
        <span>점선 = 동 단위 추정 위치</span>
        {missing > 0 && <span>· 위치 미확인 {missing}건 제외</span>}
        {demo && <span className="text-amber-700">· 데모 데이터</span>}
      </div>
    </section>
  );
}

function PriceBadge({ tier }: { tier: "high" | "mid" }) {
  return (
    <span
      className={`ml-1 inline-block shrink-0 whitespace-nowrap rounded px-1 py-px text-[10px] font-bold ${tier === "high" ? "bg-slate-900 text-white" : "bg-blue-900 text-white"}`}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
