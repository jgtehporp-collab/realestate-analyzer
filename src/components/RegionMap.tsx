"use client";

// 서울·경기 생활권 지도: 구(시)별 84㎡ 환산 중위가·변동률·거래량 라벨 + 선택 지역 상세 + 생활권 요약.
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { RegionStat, RegionStatsFile } from "@/lib/regionStats";
import { formatPct } from "@/lib/format";

type Metric = "price" | "change" | "volume" | "official";

const METRICS: { key: Metric; label: string }[] = [
  { key: "price", label: "가격" },
  { key: "change", label: "변동률" },
  { key: "official", label: "공식지수" },
  { key: "volume", label: "거래량" },
];

/** 변동(비율) → 색: 상승 빨강, 하락 파랑, 보합 회색 */
export function changeColor(v: number | null): string {
  if (v === null) return "#94a3b8";
  if (v > 0.05) return "#dc2626";
  if (v > 0.02) return "#f87171";
  if (v >= -0.02) return "#64748b";
  if (v >= -0.05) return "#60a5fa";
  return "#2563eb";
}

const shortName = (region: string) => {
  const t = region.split(" ").slice(1);
  return t[t.length - 1] ?? region;
};

const eokShort = (manwon: number | null) => (manwon === null ? "—" : `${(manwon / 10000).toFixed(1)}억`);

function labelOf(r: RegionStat, metric: Metric) {
  if (metric === "price") return { text: eokShort(r.price84), color: changeColor(r.change) };
  if (metric === "change") return { text: formatPct(r.change, 1, true), color: changeColor(r.change) };
  if (metric === "official") {
    const v = r.reb?.chg12w ?? null;
    // 주간 지수 12주 변동은 실거래 중위가보다 폭이 작아 색 기준을 2.5배로
    return { text: formatPct(v, 2, true), color: changeColor(v === null ? null : v * 2.5) };
  }
  return { text: formatPct(r.volChange, 0, true), color: changeColor(r.volChange === null ? null : r.volChange / 4) };
}

function Sparkline({ values, start, end }: { values: (number | null)[]; start: string; end: string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <p className="text-[11px] text-slate-400">월별 추이 표시할 거래 부족</p>;
  const W = 240;
  const H = 56;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => 6 + (i * (W - 12)) / Math.max(1, values.length - 1);
  const y = (v: number) => (hi === lo ? H / 2 : 6 + ((hi - v) * (H - 12)) / (hi - lo));
  const up = pts[pts.length - 1].v >= pts[0].v;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full">
      <path
        d={pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
        fill="none"
        stroke={up ? "#dc2626" : "#2563eb"}
        strokeWidth={2}
      />
      {pts.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2.2} fill={up ? "#dc2626" : "#2563eb"} />
      ))}
      <text x={6} y={H + 12} fontSize={9} fill="#64748b">
        {start}
      </text>
      <text x={W - 6} y={H + 12} fontSize={9} fill="#64748b" textAnchor="end">
        {end}
      </text>
    </svg>
  );
}

export default function RegionMap({ data, vworldKey }: { data: RegionStatsFile; vworldKey: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [metric, setMetric] = useState<Metric>("price");
  const [selected, setSelected] = useState<string | null>(null);
  const [area, setArea] = useState<"서울" | "경기">("서울");

  const placed = useMemo(() => data.regions.filter((r) => r.lat !== null && r.lng !== null), [data]);
  const sel = data.regions.find((r) => r.lawd === selected) ?? null;

  // 지도 생성 (1회)
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current || !placed.length) return;
      LRef.current = L;
      const map = L.map(ref.current, {
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
        zoomControl: true,
      }).setView([37.45, 127.0], 9);
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
  }, [placed, vworldKey]);

  // 라벨 (지표·선택 변경 시 다시 그림)
  useEffect(() => {
    const L = LRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    for (const r of placed) {
      const { text, color } = labelOf(r, metric);
      const active = r.lawd === selected;
      L.marker([r.lat!, r.lng!], {
        icon: L.divIcon({
          className: "",
          iconSize: [0, 0],
          html: `<div class="rm-label${active ? " rm-active" : ""}" style="background:${color}"><span>${shortName(r.region)}</span><b>${text}</b></div>`,
        }),
        zIndexOffset: active ? 1000 : 0,
      })
        .on("click", () => setSelected(r.lawd))
        .addTo(layer);
    }
  }, [ready, placed, metric, selected]);

  // 서울/경기 전환 시 해당 지역으로 화면 맞춤 (한 화면에 60곳을 다 넣으면 서울 라벨이 겹침)
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const pts = placed.filter((r) => r.region.startsWith(area)).map((r) => [r.lat!, r.lng!] as [number, number]);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
  }, [ready, placed, area]);

  if (!data.generatedAt || !placed.length) {
    return (
      <section className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
        서울·경기 생활권 지도는 다음 일일 갱신(새벽 5시경) 후 표시됩니다.
      </section>
    );
  }

  const seoulZones = data.zones.filter((z) => z.province === "서울");
  const ggZones = data.zones.filter((z) => z.province === "경기");

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2">
        <h2 className="text-sm font-bold text-white">
          서울·경기 생활권 지도 <span className="font-normal text-slate-300">(84㎡ 환산 중위가)</span>
        </h2>
        <div className="flex gap-1.5">
        <div className="flex overflow-hidden rounded-md bg-white/10 text-xs">
          {(["서울", "경기"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`px-2.5 py-1 font-semibold ${area === a ? "bg-white text-navy" : "text-slate-200"}`}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex overflow-hidden rounded-md bg-white/10 text-xs">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 font-semibold ${metric === m.key ? "bg-accent text-white" : "text-slate-200"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_260px]">
        <div ref={ref} className="h-[360px] w-full bg-slate-100 lg:h-[520px]" />

        <aside className="border-t border-slate-100 p-3 text-xs lg:border-l lg:border-t-0">
          {!sel ? (
            <p className="text-slate-500">지도에서 구(시)를 누르면 가격 추이·거래량·상승 단지를 볼 수 있습니다.</p>
          ) : (
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-slate-500">{sel.zone}</div>
                <div className="text-base font-bold">{sel.region}</div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <div className="rounded bg-slate-50 py-1">
                  <div className="text-[10px] text-slate-500">84㎡ 환산</div>
                  <div className="font-bold">{eokShort(sel.price84)}</div>
                </div>
                <div className="rounded bg-slate-50 py-1">
                  <div className="text-[10px] text-slate-500">변동률</div>
                  <div className="font-bold" style={{ color: changeColor(sel.change) }}>
                    {formatPct(sel.change, 1, true)}
                  </div>
                </div>
                <div className="rounded bg-slate-50 py-1">
                  <div className="text-[10px] text-slate-500">거래량</div>
                  <div className="font-bold">{formatPct(sel.volChange, 0, true)}</div>
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-[11px] font-semibold text-slate-600">월별 84㎡ 환산 중위가</div>
                <Sparkline
                  values={sel.monthly}
                  start={`${data.months[0].slice(2, 4)}.${data.months[0].slice(4)}`}
                  end={`${data.months[data.months.length - 1].slice(2, 4)}.${data.months[data.months.length - 1].slice(4)}`}
                />
              </div>
              <div className="text-[11px] text-slate-500">
                최근 3개월 {sel.recentCount}건 · 직전 3개월 {sel.prevCount}건
              </div>
              {sel.reb && (
                <div className="rounded border border-slate-100 p-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] font-semibold text-slate-600">공식 매매지수 (한국부동산원 주간)</span>
                    <span className="font-bold">{sel.reb.index.toFixed(1)}</span>
                  </div>
                  <div className="mt-0.5 flex gap-2 text-[11px]">
                    {[
                      ["전주", sel.reb.wow],
                      ["4주", sel.reb.chg4w],
                      ["12주", sel.reb.chg12w],
                    ].map(([k, v]) => (
                      <span key={k as string}>
                        {k}{" "}
                        <b style={{ color: changeColor(typeof v === "number" ? v * 2.5 : null) }}>{formatPct(v as number | null, 2, true)}</b>
                      </span>
                    ))}
                  </div>
                  <Sparkline values={sel.reb.series} start={`${sel.reb.series.length}주 전`} end={sel.reb.lastWeek} />
                  {sel.change !== null && sel.reb.chg12w !== null && Math.sign(sel.change) !== Math.sign(sel.reb.chg12w) && (
                    <p className="text-[10px] text-amber-700">
                      실거래 중위가와 공식지수 방향이 다름 - 거래된 단지 구성 영향일 수 있어 공식지수를 우선 참고
                    </p>
                  )}
                </div>
              )}
              {sel.pop && (
                <div className="text-[11px] text-slate-600">
                  주민등록인구 <b>{(sel.pop.total / 10000).toFixed(1)}만명</b>
                  {sel.pop.yoy !== null && (
                    <>
                      {" "}
                      (전년비 <b style={{ color: changeColor(sel.pop.yoy * 5) }}>{formatPct(sel.pop.yoy, 1, true)}</b>)
                    </>
                  )}{" "}
                  <span className="text-slate-400">
                    {sel.pop.ym.slice(0, 4)}.{sel.pop.ym.slice(4)} KOSIS
                  </span>
                </div>
              )}
              {sel.top.length > 0 && (
                <div>
                  <div className="mb-0.5 text-[11px] font-semibold text-slate-600">상승 단지</div>
                  {sel.top.map((t) => (
                    <a key={t.id} href={`/report?lawd=${sel.lawd}&id=${encodeURIComponent(t.id)}`} className="flex justify-between py-0.5">
                      <span className="truncate">
                        {t.aptNm} <span className="text-slate-400">{t.band}</span>
                      </span>
                      <span className="shrink-0 pl-1 font-semibold text-red-600">{formatPct(t.change, 1, true)}</span>
                    </a>
                  ))}
                </div>
              )}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("rea:pick-region", { detail: { lawd: sel.lawd } }))}
                className="w-full rounded-md bg-navy py-1.5 font-semibold text-white"
              >
                이 지역 단지 찾기
              </button>
            </div>
          )}
        </aside>
      </div>

      <div className="border-t border-slate-100 p-3">
        <h3 className="text-xs font-bold text-slate-700">생활권별 흐름</h3>
        {[
          { title: "서울", list: seoulZones },
          { title: "경기", list: ggZones },
        ].map((g) => (
          <div key={g.title} className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="w-7 text-[11px] font-semibold text-slate-500">{g.title}</span>
            {g.list.map((z) => (
              <span key={z.zone} className="rounded-md border border-slate-200 px-2 py-1 text-[11px]">
                <span className="font-semibold">{z.zone}</span> {eokShort(z.price84)}{" "}
                <b style={{ color: changeColor(z.change) }}>{formatPct(z.change, 1, true)}</b>
                {typeof z.rebChg12w === "number" && (
                  <span className="text-slate-500">
                    {" "}
                    · 지수12주 <b style={{ color: changeColor(z.rebChg12w * 2.5) }}>{formatPct(z.rebChg12w, 2, true)}</b>
                  </span>
                )}
                {typeof z.popYoy === "number" && (
                  <span className="text-slate-500">
                    {" "}
                    · 인구 <b>{formatPct(z.popYoy, 1, true)}</b>
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}
        <p className="mt-2 text-[10px] leading-snug text-slate-400">
          {data.basis}. 직거래·1층 이하·도시형생활주택 제외. 구(시) 단위 중위가는 그 기간 거래된 단지 구성에 따라 달라질 수 있음. 거래량은
          최근 3개월 vs 직전 3개월. 공식지수: 한국부동산원 주간 아파트 매매가격지수(R-ONE) 12주 변동. 인구: KOSIS 주민등록인구.
        </p>
      </div>
    </section>
  );
}
