// 실거래 원자료(매매/전월세)를 단지 1페이지 분석 리포트용 데이터로 가공하는 순수 함수 모음.
import type { BuildingInfo, KaptInfo } from "./kapt";
import type { LocationInfo } from "./location";
import type { RentRow, TradeRow } from "./molit";

export type ExtraStatus = { state: "ok" | "nokey" | "notfound" | "error" | "demo"; message?: string };

export type Extras = {
  kapt: KaptInfo | null;
  building: BuildingInfo | null;
  location: LocationInfo | null;
  status: { kapt: ExtraStatus; building: ExtraStatus; map: ExtraStatus; poi: ExtraStatus };
};

export type Complex = {
  id: string;
  aptNm: string;
  umdNm: string;
  jibun: string;
  buildYear: number;
  tradeCount: number;
  lastPrice: number | null; // 만원
  lastYm: string | null;
};

export type SeriesPoint = {
  ym: string;
  sale: number | null; // 월평균 매매가(만원)
  saleCount: number;
  jeonse: number | null; // 월평균 전세보증금(만원)
  jeonseCount: number;
};

export type KeyPoint = { ym: string; value: number };

export type BandReport = {
  band: number; // 20 → 20평대
  label: string;
  mainArea: number; // 대표 전용면적
  areas: number[];
  tradeCount: number;
  jeonseCount: number;
  series: SeriesPoint[];
  peak: KeyPoint | null; // 전고점
  trough: KeyPoint | null; // 전고점 이후 하락점
  riseStart: KeyPoint | null; // 전고점 이전 저점(상승 시작)
  current: KeyPoint | null; // 최근 거래월
  jeonse: number | null; // 최근 3개월 전세 평균
  jeonseRatio: number | null;
  gap: number | null; // 투자금(매매 - 전세)
  fromPeak: number | null; // 전고점 대비 현재 (-0.05 = -5%)
  troughDrop: number | null; // 전고점 대비 하락점
  recoveryGain: number | null; // 전고점 회복 시 차익
  recoveryRoi: number | null; // 차익 / 투자금
};

export type Report = {
  demo: boolean;
  lawd: string;
  regionName: string;
  complex: {
    id: string;
    aptNm: string;
    umdNm: string;
    jibun: string;
    address: string;
    buildYear: number | null;
    age: number | null;
    maxFloor: number | null;
    areas: number[];
  };
  months: string[];
  failedMonths: string[];
  activity: {
    trades3m: number;
    tradesTotal: number;
    jeonseTotal: number;
    wolseTotal: number;
    jeonseShare: number | null;
  };
  bands: BandReport[]; // 차트용 상위 2개 평형대 (큰 평형 먼저)
  otherBands: { label: string; tradeCount: number }[];
  tags: string[];
  notes: { value: string; price: string; invest: string };
  extras: Extras;
  generatedAt: string;
};

export const normalizeName = (s: string) =>
  s.replace(/\s+/g, "").replace(/[()（）\-·.,]/g, "").toLowerCase();

/** 단지 식별자. aptSeq가 있으면 그것을, 없으면 법정동+지번+단지명으로. */
export function complexId(r: { aptSeq: string; umdNm: string; jibun: string; aptNm: string }): string {
  return r.aptSeq ? `s:${r.aptSeq}` : `n:${r.umdNm}|${r.jibun}|${r.aptNm}`;
}

export function searchComplexes(trades: TradeRow[], query: string): Complex[] {
  const q = normalizeName(query);
  const map = new Map<string, Complex>();
  for (const t of trades) {
    if (q && !normalizeName(t.aptNm).includes(q)) continue;
    const id = complexId(t);
    let c = map.get(id);
    if (!c) {
      c = { id, aptNm: t.aptNm, umdNm: t.umdNm, jibun: t.jibun, buildYear: t.buildYear, tradeCount: 0, lastPrice: null, lastYm: null };
      map.set(id, c);
    }
    c.tradeCount++;
    const ymd = `${t.ym}${String(t.day).padStart(2, "0")}`;
    if (!c.lastYm || ymd >= c.lastYm) {
      c.lastYm = ymd;
      c.lastPrice = t.price;
    }
  }
  const list = [...map.values()].map((c) => ({ ...c, lastYm: c.lastYm ? c.lastYm.slice(0, 6) : null }));
  // 정확히 일치하는 이름 우선, 그 다음 거래량 순
  list.sort((a, b) => {
    const ea = normalizeName(a.aptNm) === q ? 1 : 0;
    const eb = normalizeName(b.aptNm) === q ? 1 : 0;
    return eb - ea || b.tradeCount - a.tradeCount;
  });
  return list.slice(0, 50);
}

/** 전용면적(㎡) → 평형대(공급면적 기준 관례). 59㎡→20평대, 84㎡→30평대. */
export function areaBand(area: number): number {
  if (area < 40) return 10;
  if (area < 62) return 20;
  if (area < 100) return 30;
  if (area < 135) return 40;
  if (area < 170) return 50;
  return 60;
}

const bandLabel = (b: number) => (b >= 60 ? "60평대 이상" : b <= 10 ? "10평대 이하" : `${b}평대`);

function matcher(id: string, anchor: { umdNm: string; jibun: string } | null) {
  if (id.startsWith("s:")) {
    const seq = id.slice(2);
    return (r: { aptSeq: string; umdNm: string; jibun: string }) =>
      r.aptSeq ? r.aptSeq === seq : !!anchor && r.umdNm === anchor.umdNm && r.jibun === anchor.jibun;
  }
  const [umdNm, jibun, aptNm] = id.slice(2).split("|");
  const n = normalizeName(aptNm ?? "");
  return (r: { umdNm: string; jibun: string; aptNm: string }) =>
    r.umdNm === umdNm && (r.jibun === jibun || normalizeName(r.aptNm) === n);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function mode(xs: number[]): number | null {
  if (!xs.length) return null;
  const m = new Map<number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function buildBand(band: number, months: string[], trades: TradeRow[], jeonse: RentRow[]): BandReport {
  // 같은 평형대 안에 여러 전용면적(예: 74㎡·84㎡)이 섞이면 평균이 왜곡되므로 대표면적 기준 ㎡당 가격으로 환산
  const mainArea = mode(trades.map((t) => t.area)) ?? mode(jeonse.map((r) => r.area)) ?? 0;
  const adj = (v: number, area: number) => (mainArea && area ? (v / area) * mainArea : v);
  const series: SeriesPoint[] = months.map((ym) => {
    const s = trades.filter((t) => t.ym === ym).map((t) => adj(t.price, t.area));
    const j = jeonse.filter((r) => r.ym === ym).map((r) => adj(r.deposit, r.area));
    return { ym, sale: avg(s), saleCount: s.length, jeonse: avg(j), jeonseCount: j.length };
  });

  const salePts = series.map((p, i) => ({ i, ym: p.ym, v: p.sale })).filter((p): p is { i: number; ym: string; v: number } => p.v !== null);
  let peak: KeyPoint | null = null;
  let trough: KeyPoint | null = null;
  let riseStart: KeyPoint | null = null;
  let current: KeyPoint | null = null;
  if (salePts.length) {
    const pk = salePts.reduce((a, b) => (b.v >= a.v ? b : a)); // 동률이면 최근 값
    peak = { ym: pk.ym, value: pk.v };
    const last = salePts[salePts.length - 1];
    current = { ym: last.ym, value: last.v };
    const after = salePts.filter((p) => p.i > pk.i);
    if (after.length) {
      const tr = after.reduce((a, b) => (b.v < a.v ? b : a));
      if (tr.v < pk.v) trough = { ym: tr.ym, value: tr.v };
    }
    const before = salePts.filter((p) => p.i < pk.i);
    if (before.length) {
      const lo = before.reduce((a, b) => (b.v <= a.v ? b : a));
      if ((pk.v - lo.v) / lo.v >= 0.05) riseStart = { ym: lo.ym, value: lo.v };
    }
  }

  // 최근 전세: 마지막 전세 거래월 기준 3개월 평균
  let jeonseAvg: number | null = null;
  const lastJ = [...series].reverse().find((p) => p.jeonse !== null);
  if (lastJ) {
    const idx = months.indexOf(lastJ.ym);
    const win = new Set(months.slice(Math.max(0, idx - 2), idx + 1));
    jeonseAvg = avg(jeonse.filter((r) => win.has(r.ym)).map((r) => adj(r.deposit, r.area)));
  }

  const cur = current?.value ?? null;
  const jeonseRatio = cur && jeonseAvg ? jeonseAvg / cur : null;
  const gap = cur && jeonseAvg ? cur - jeonseAvg : null;
  const fromPeak = cur && peak ? (cur - peak.value) / peak.value : null;
  const troughDrop = trough && peak ? (trough.value - peak.value) / peak.value : null;
  const recoveryGain = cur && peak ? Math.max(0, peak.value - cur) : null;
  const recoveryRoi = recoveryGain !== null && gap && gap > 0 ? recoveryGain / gap : null;

  const areas = [...new Set([...trades, ...jeonse].map((r) => r.area))].sort((a, b) => a - b);
  return {
    band,
    label: bandLabel(band),
    mainArea,
    areas,
    tradeCount: trades.length,
    jeonseCount: jeonse.length,
    series,
    peak,
    trough,
    riseStart,
    current,
    jeonse: jeonseAvg,
    jeonseRatio,
    gap,
    fromPeak,
    troughDrop,
    recoveryGain,
    recoveryRoi,
  };
}

const eok = (manwon: number) => {
  const e = Math.floor(manwon / 10000);
  const r = Math.round(manwon % 10000);
  if (!e) return `${r.toLocaleString("ko-KR")}만`;
  return r ? `${e}억 ${r.toLocaleString("ko-KR")}만` : `${e}억`;
};
const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;
const ymLabel = (ym: string) => `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;

export function buildReport(input: {
  demo: boolean;
  lawd: string;
  regionName: string;
  id: string;
  months: string[];
  trades: TradeRow[];
  rents: RentRow[];
  failedMonths: string[];
  now?: Date;
}): Report | null {
  const { id, months } = input;
  // aptSeq가 없는 행(주로 전월세)을 붙이기 위한 기준 위치: 매칭된 매매 거래의 법정동+지번
  const seqMatch = id.startsWith("s:") ? input.trades.find((t) => t.aptSeq === id.slice(2)) : undefined;
  const anchor = seqMatch ? { umdNm: seqMatch.umdNm, jibun: seqMatch.jibun } : null;
  const match = matcher(id, anchor);
  const trades = input.trades.filter(match);
  const rents = input.rents.filter(match);
  if (!trades.length && !rents.length) return null;

  const jeonse = rents.filter((r) => r.monthly === 0);
  const wolse = rents.filter((r) => r.monthly > 0);

  const bandsAll = new Map<number, { trades: TradeRow[]; jeonse: RentRow[] }>();
  for (const t of trades) {
    const b = areaBand(t.area);
    if (!bandsAll.has(b)) bandsAll.set(b, { trades: [], jeonse: [] });
    bandsAll.get(b)!.trades.push(t);
  }
  for (const r of jeonse) {
    const b = areaBand(r.area);
    if (!bandsAll.has(b)) bandsAll.set(b, { trades: [], jeonse: [] });
    bandsAll.get(b)!.jeonse.push(r);
  }
  const ranked = [...bandsAll.entries()]
    .filter(([, v]) => v.trades.length > 0)
    .sort((a, b) => b[1].trades.length - a[1].trades.length || b[1].jeonse.length - a[1].jeonse.length);
  const chosen = ranked.slice(0, 2).sort((a, b) => b[0] - a[0]);
  const bands = chosen.map(([b, v]) => buildBand(b, months, v.trades, v.jeonse));
  const otherBands = ranked.slice(2).map(([b, v]) => ({ label: bandLabel(b), tradeCount: v.trades.length }));

  const ref = [...trades, ...rents][0];
  const nameCounts = new Map<string, number>();
  for (const r of [...trades, ...rents]) nameCounts.set(r.aptNm, (nameCounts.get(r.aptNm) ?? 0) + 1);
  const aptNm = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const buildYear = mode([...trades, ...rents].map((r) => r.buildYear).filter(Boolean));
  const now = input.now ?? new Date();
  const thisYear = new Date(now.getTime() + 9 * 3600e3).getUTCFullYear();
  const age = buildYear ? Math.max(1, thisYear - buildYear) : null;
  const floors = [...trades, ...rents].map((r) => r.floor).filter((f) => f > 0);
  const maxFloor = floors.length ? Math.max(...floors) : null;

  const last3 = new Set(months.slice(-3));
  const trades3m = trades.filter((t) => last3.has(t.ym)).length;
  const jeonseShare = rents.length ? jeonse.length / rents.length : null;

  const main = bands[0] ?? null;

  // 특징 태그
  const tags: string[] = [];
  if (age !== null) tags.push(age <= 5 ? "#신축" : age <= 10 ? "#준신축" : age >= 25 ? "#구축" : `#${age}년차`);
  tags.push(`#${input.regionName.split(" ").slice(-1)[0]}`);
  if (trades3m >= 10) tags.push("#거래활발");
  else if (trades3m <= 2) tags.push("#거래한산");
  if (main?.jeonseRatio) {
    tags.push(`#전세가율${Math.round(main.jeonseRatio * 100)}%`);
    if (main.jeonseRatio >= 0.7) tags.push("#갭투자유리");
  }
  if (main?.fromPeak !== null && main?.fromPeak !== undefined) {
    if (main.fromPeak >= -0.01) tags.push("#전고점돌파");
    else if (main.fromPeak <= -0.1) tags.push("#전고점대비저평가");
  }
  if (jeonseShare !== null && jeonseShare >= 0.7) tags.push("#전세안정");

  // 코멘트 (규칙 기반)
  const value: string[] = [];
  if (buildYear) value.push(`${buildYear}년 입주(${age}년차) 단지.`);
  value.push(`${input.regionName} ${ref.umdNm} 위치.`);
  if (bands.length) value.push(`주력 평형은 ${bands.map((b) => `${b.label}(전용 ${b.mainArea}㎡)`).join(", ")}.`);
  value.push(`최근 3개월 매매 ${trades3m}건, 분석기간 매매 ${trades.length}건·전세 ${jeonse.length}건.`);

  const price: string[] = [];
  for (const b of bands) {
    if (!b.current || !b.peak) continue;
    let s = `${b.label} 전고점 ${eok(b.peak.value)}(${ymLabel(b.peak.ym)})`;
    if (b.trough) s += ` → 하락점 ${eok(b.trough.value)}(${ymLabel(b.trough.ym)}, ${pct(b.troughDrop!)})`;
    s += ` → 현재 ${eok(b.current.value)}(${ymLabel(b.current.ym)}), 전고점 대비 ${pct(b.fromPeak!)}.`;
    if (b.jeonseRatio) s += ` 전세가율 ${pct(b.jeonseRatio)}.`;
    price.push(s);
  }

  const invest: string[] = [];
  if (main?.gap) {
    invest.push(`${main.label} 투자금(갭) ${eok(main.gap)}.`);
    if (main.fromPeak !== null && main.fromPeak < -0.01) {
      invest.push(`전고점 회복 시 차익 ${eok(main.recoveryGain ?? 0)}` + (main.recoveryRoi ? ` (투자금 대비 ${pct(main.recoveryRoi, 0)}).` : "."));
    } else {
      invest.push("현재가가 전고점 수준으로, 추가 상승 여력은 신고가 형성 여부 확인 필요.");
    }
    if (main.jeonseRatio !== null && main.jeonseRatio < 0.4) invest.push("전세가율이 낮아 갭 부담이 큼 - 실거주 관점 접근 권장.");
    else if (main.jeonseRatio !== null && main.jeonseRatio >= 0.7) invest.push("전세가율이 높아 소액 투자 가능하나 역전세 리스크 점검 필요.");
  } else if (main) {
    invest.push("최근 전세 거래가 부족해 투자금 산정이 어렵습니다.");
  }
  if (trades3m <= 2) invest.push("최근 거래가 적어 시세 대표성이 낮을 수 있음.");

  return {
    demo: input.demo,
    lawd: input.lawd,
    regionName: input.regionName,
    complex: {
      id,
      aptNm,
      umdNm: ref.umdNm,
      jibun: ref.jibun,
      address: `${input.regionName} ${ref.umdNm} ${ref.jibun}`.trim(),
      buildYear,
      age,
      maxFloor,
      areas: [...new Set(trades.map((t) => t.area))].sort((a, b) => a - b),
    },
    months,
    failedMonths: input.failedMonths,
    activity: {
      trades3m,
      tradesTotal: trades.length,
      jeonseTotal: jeonse.length,
      wolseTotal: wolse.length,
      jeonseShare,
    },
    bands,
    otherBands,
    tags,
    notes: { value: value.join(" "), price: price.join(" ") || "매매 거래 부족", invest: invest.join(" ") || "-" },
    extras: {
      kapt: null,
      building: null,
      location: null,
      status: { kapt: { state: "demo" }, building: { state: "demo" }, map: { state: "demo" }, poi: { state: "demo" } },
    },
    generatedAt: now.toISOString(),
  };
}
