"use client";

// 생활권 지도 (반경 1km). 배경지도는 VWorld(키 있을 때) 또는 OpenStreetMap.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Poi, PoiType } from "@/lib/location";

export const POI_STYLE: Record<PoiType, { color: string; label: string }> = {
  elementary: { color: "#1d4ed8", label: "초등학교" },
  middle: { color: "#0891b2", label: "중학교" },
  high: { color: "#7c3aed", label: "고등학교" },
  subway: { color: "#dc2626", label: "지하철역" },
  mart: { color: "#ea580c", label: "대형마트" },
  hospital: { color: "#16a34a", label: "병원" },
  academy: { color: "#a16207", label: "학원" },
  park: { color: "#65a30d", label: "공원" },
};

type Props = { lat: number; lng: number; pois: Poi[] | null; vworldKey: string | null; title: string };

export default function MapView({ lat, lng, pois, vworldKey, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let observer: ResizeObserver | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile, // 모바일에서는 한 손가락 스크롤이 페이지 스크롤이 되도록
        attributionControl: true,
      }).setView([lat, lng], 15); // 뷰가 있어야 레이어가 즉시 붙음(getBounds 등)
      if (vworldKey) {
        L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${vworldKey}/Base/{z}/{y}/{x}.png`, {
          maxZoom: 19,
          minZoom: 6,
          attribution: "© VWorld",
        }).addTo(map);
      } else {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        }).addTo(map);
      }
      const circle = L.circle([lat, lng], {
        radius: 1000,
        color: "#f97316",
        weight: 2,
        dashArray: "6 6",
        fillOpacity: 0.04,
      }).addTo(map);
      map.fitBounds(circle.getBounds(), { padding: [4, 4] });
      // 레이아웃(그리드 높이)이 확정된 뒤 크기가 바뀌면 다시 맞춤
      observer = new ResizeObserver(() => {
        map?.invalidateSize();
        map?.fitBounds(circle.getBounds(), { padding: [4, 4] });
      });
      observer.observe(ref.current);

      for (const p of pois ?? []) {
        const s = POI_STYLE[p.type];
        L.circleMarker([p.lat, p.lng], {
          radius: p.type === "subway" ? 7 : 5.5,
          color: "white",
          weight: 1.5,
          fillColor: s.color,
          fillOpacity: 0.95,
        })
          .bindTooltip(`${p.name} · ${Math.round(p.distance)}m`, { direction: "top" })
          .addTo(map);
      }
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: '<div style="font-size:26px;line-height:26px;color:#f97316;text-shadow:0 0 3px white,0 0 3px white">★</div>',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        zIndexOffset: 1000,
      })
        .bindTooltip(title, { direction: "top", permanent: false })
        .addTo(map);
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [lat, lng, pois, vworldKey, title]);

  const present = new Set((pois ?? []).map((p) => p.type));
  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="min-h-[280px] w-full flex-1 bg-slate-100" />
      {present.size > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 py-2 text-[11px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="text-accent">★</span> 단지
          </span>
          {(Object.keys(POI_STYLE) as PoiType[])
            .filter((t) => present.has(t))
            .map((t) => (
              <span key={t} className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: POI_STYLE[t].color }} />
                {POI_STYLE[t].label}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
