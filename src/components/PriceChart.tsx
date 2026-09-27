// 평형대별 매매·전세 월평균 실거래 차트 (순수 SVG, 서버 렌더링).
import type { BandReport, KeyPoint } from "@/lib/analysis";
import { formatEokShort, formatYmShort } from "@/lib/format";

const W = 600;
const H = 290;
const M = { l: 54, r: 18, t: 16, b: 30 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

const COLORS = {
  sale: "#dc2626",
  jeonse: "#2563eb",
  peak: "#dc2626",
  trough: "#2563eb",
  current: "#16a34a",
  rise: "#6366f1",
};

function niceStep(range: number): number {
  const raw = range / 5;
  const steps = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  return steps.find((s) => s >= raw) ?? 100000;
}

type Marker = {
  key: string;
  title: string;
  point: KeyPoint;
  color: string;
  shape: "diamond" | "down" | "circle" | "up";
  below?: boolean;
};

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export default function PriceChart({ band }: { band: BandReport }) {
  const { series } = band;
  const n = series.length;
  const values = series.flatMap((p) => [p.sale, p.jeonse]).filter((v): v is number => v !== null);
  if (!values.length) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">거래 데이터 없음</div>;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, hi * 0.03);
  lo = Math.max(0, lo - pad);
  hi = hi + pad * 2.2; // 위쪽은 라벨 공간 확보
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);

  const x = (i: number) => M.l + (n === 1 ? PW / 2 : (i * PW) / (n - 1));
  const y = (v: number) => M.t + PH - ((v - lo) / (hi - lo)) * PH;
  const idx = (ym: string) => series.findIndex((p) => p.ym === ym);

  const path = (key: "sale" | "jeonse") =>
    series
      .map((p, i) => (p[key] === null ? null : `${x(i).toFixed(1)},${y(p[key]!).toFixed(1)}`))
      .filter(Boolean)
      .map((pt, i) => `${i ? "L" : "M"}${pt}`)
      .join(" ");

  const labelEvery = Math.max(1, Math.ceil(n / 7));
  const xLabels = series.map((p, i) => ({ i, ym: p.ym })).filter(({ i }) => (n - 1 - i) % labelEvery === 0);

  const markers: Marker[] = [];
  if (band.riseStart) markers.push({ key: "rise", title: "상승시작", point: band.riseStart, color: COLORS.rise, shape: "up" });
  const cur = band.current;
  if (band.peak) {
    const title = cur?.ym === band.peak.ym ? "전고점·현재" : "전고점";
    markers.push({ key: "peak", title, point: band.peak, color: COLORS.peak, shape: "diamond" });
  }
  if (band.trough) {
    const title = cur?.ym === band.trough.ym ? "하락점·현재" : "하락점";
    markers.push({ key: "trough", title, point: band.trough, color: COLORS.trough, shape: "down", below: true });
  }
  if (cur && cur.ym !== band.peak?.ym && cur.ym !== band.trough?.ym) {
    markers.push({ key: "current", title: "현재", point: cur, color: COLORS.current, shape: "circle" });
  }

  // 라벨 배치 (겹치면 위/아래로 비켜감)
  const placed: Box[] = [];
  const laid = markers.map((m) => {
    const px = x(idx(m.point.ym));
    const py = y(m.point.value);
    const w = Math.max(64, m.title.length * 13 + 12);
    const h = 34;
    const bx = Math.min(Math.max(px - w / 2, M.l + 2), W - M.r - w - 2);
    const candidates = m.below
      ? [py + 12, py + 12 + h + 4, py - 12 - h, py - 12 - 2 * h - 4]
      : [py - 12 - h, py - 12 - 2 * h - 4, py + 12, py + 12 + h + 4];
    let box: Box | null = null;
    for (const cy of candidates) {
      const b = { x: bx, y: Math.min(Math.max(cy, 1), H - M.b - h - 1), w, h };
      if (!placed.some((p) => overlaps(p, b))) {
        box = b;
        break;
      }
    }
    box ??= { x: bx, y: Math.max(1, py - 12 - h), w, h };
    placed.push(box);
    return { m, px, py, box };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label={`${band.label} 매매·전세 실거래 추이`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth={1} />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize={13} fill="#475569">
            {(t / 10000).toFixed(step < 10000 ? 1 : 0)}억
          </text>
        </g>
      ))}
      <line x1={M.l} x2={W - M.r} y1={M.t + PH} y2={M.t + PH} stroke="#94a3b8" />
      {xLabels.map(({ i, ym }) => (
        <text key={ym} x={x(i)} y={H - 8} textAnchor="middle" fontSize={13} fill="#475569">
          {formatYmShort(ym)}
        </text>
      ))}

      {laid.map(({ m, px, py }) => (
        <line key={`v-${m.key}`} x1={px} x2={px} y1={py} y2={M.t + PH} stroke={m.color} strokeDasharray="2 3" strokeWidth={1.2} opacity={0.7} />
      ))}

      <path d={path("jeonse")} fill="none" stroke={COLORS.jeonse} strokeWidth={2.2} strokeDasharray="7 4" />
      {series.map((p, i) =>
        p.jeonse === null ? null : <rect key={`j${i}`} x={x(i) - 3} y={y(p.jeonse) - 3} width={6} height={6} fill={COLORS.jeonse} />,
      )}
      <path d={path("sale")} fill="none" stroke={COLORS.sale} strokeWidth={2.6} strokeLinejoin="round" />
      {series.map((p, i) => (p.sale === null ? null : <circle key={`s${i}`} cx={x(i)} cy={y(p.sale)} r={3.3} fill={COLORS.sale} />))}

      {laid.map(({ m, px, py, box }) => (
        <g key={m.key}>
          <MarkerShape shape={m.shape} x={px} y={py} color={m.color} />
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={4} fill="white" stroke={m.color} strokeWidth={1.3} />
          <text x={box.x + box.w / 2} y={box.y + 14.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={m.color}>
            {m.title}
          </text>
          <text x={box.x + box.w / 2} y={box.y + 29} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={m.color}>
            {formatEokShort(m.point.value)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function MarkerShape({ shape, x, y, color }: { shape: Marker["shape"]; x: number; y: number; color: string }) {
  const s = 8;
  switch (shape) {
    case "diamond":
      return <path d={`M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} Z`} fill={color} stroke="white" strokeWidth={1.5} />;
    case "down":
      return <path d={`M${x - s},${y - s * 0.7} L${x + s},${y - s * 0.7} L${x},${y + s * 0.8} Z`} fill={color} stroke="white" strokeWidth={1.5} />;
    case "up":
      return <path d={`M${x - s},${y + s * 0.7} L${x + s},${y + s * 0.7} L${x},${y - s * 0.8} Z`} fill={color} stroke="white" strokeWidth={1.5} />;
    default:
      return <circle cx={x} cy={y} r={7} fill={color} stroke="white" strokeWidth={1.5} />;
  }
}
