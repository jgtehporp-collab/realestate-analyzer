// API 키가 없을 때 화면 확인용으로 쓰는 결정적(같은 입력 → 같은 결과) 가상 실거래 데이터.
import type { Announcement, Competition, HouseModel, Score } from "./applyhome";
import type { RentRow, TradeRow } from "./molit";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoRows(lawd: string, aptNm: string, months: string[]): { trades: TradeRow[]; rents: RentRow[] } {
  const rand = rng(hash(`${lawd}:${aptNm}`));
  const seoul = lawd.startsWith("11");
  const base84 = (seoul ? 120000 : 55000) * (0.7 + rand() * 0.8); // 만원
  const buildYear = 2000 + Math.floor(rand() * 25);
  const aptSeq = `demo-${hash(aptNm) % 100000}`;
  const common = { aptSeq, aptNm, umdNm: "데모동", jibun: `${1 + Math.floor(rand() * 900)}`, buildYear };

  // 상승 → 전고점 → 조정 → 회복 흐름
  const peakAt = Math.floor(months.length * (0.55 + rand() * 0.2));
  const trend = (i: number) => {
    if (i <= peakAt) return 0.82 + (0.18 * i) / peakAt;
    const k = (i - peakAt) / Math.max(1, months.length - 1 - peakAt);
    return 1 - 0.1 * Math.sin(Math.PI * Math.min(1, k * 1.4)) - 0.03 * k;
  };
  const jeonseRatio = 0.45 + rand() * 0.25;

  const trades: TradeRow[] = [];
  const rents: RentRow[] = [];
  const types = [
    { area: 84.97, mult: 1 },
    { area: 59.92, mult: 0.74 },
  ];
  months.forEach((ym, i) => {
    for (const t of types) {
      const n = Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const price = Math.round((base84 * t.mult * trend(i) * (0.96 + rand() * 0.08)) / 100) * 100;
        trades.push({ ...common, area: t.area, price, floor: 2 + Math.floor(rand() * 25), ym, day: 1 + Math.floor(rand() * 28) });
      }
      const r = 2 + Math.floor(rand() * 5);
      for (let k = 0; k < r; k++) {
        const wolse = rand() < 0.3;
        const deposit = Math.round((base84 * t.mult * jeonseRatio * (0.95 + rand() * 0.1) * (wolse ? 0.3 : 1)) / 500) * 500;
        rents.push({
          ...common,
          area: t.area,
          deposit,
          monthly: wolse ? 100 + Math.floor(rand() * 150) : 0,
          floor: 2 + Math.floor(rand() * 25),
          ym,
          day: 1 + Math.floor(rand() * 28),
        });
      }
    }
  });
  return { trades, rents };
}

const DEMO_LABELS = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  subway: "지하철역",
  mart: "대형마트",
  hospital: "병원",
  academy: "학원",
  park: "공원",
} as const;

/** 데모용 가상 생활권 (서울시청 주변 좌표에 가상의 시설 배치). */
export function demoPois(seedText: string) {
  const rand = rng(hash(`poi:${seedText}`));
  const lat = 37.5665;
  const lng = 126.978;
  const types = [
    ["elementary", 3],
    ["middle", 2],
    ["high", 2],
    ["subway", 2],
    ["mart", 2],
    ["hospital", 6],
    ["academy", 8],
    ["park", 3],
  ] as const;
  const pois = types.flatMap(([type, n]) =>
    Array.from({ length: n }, (_, i) => {
      const r = 150 + rand() * 820;
      const a = rand() * Math.PI * 2;
      return {
        type,
        name: `(데모) ${DEMO_LABELS[type]} ${i + 1}`,
        lat: lat + (r * Math.sin(a)) / 111000,
        lng: lng + (r * Math.cos(a)) / 88000,
        distance: r,
      };
    }),
  );
  return { lat, lng, pois };
}

// ---- 분양 탭 데모 (키 없을 때) ----

function shiftDate(days: number): string {
  return new Date(Date.now() + 9 * 3600e3 + days * 86400e3).toISOString().slice(0, 10);
}

function demoAnnouncement(no: string, name: string, address: string, offset: number): Announcement {
  return {
    kind: "apt",
    kindLabel: "APT",
    houseManageNo: no,
    pblancNo: no,
    name,
    houseType: "APT",
    saleType: "민영",
    address,
    households: 480,
    noticeDate: shiftDate(offset - 10),
    specialStart: shiftDate(offset),
    specialEnd: shiftDate(offset),
    receiptStart: shiftDate(offset),
    receiptEnd: shiftDate(offset + 2),
    rank1Local: shiftDate(offset + 1),
    winnerDate: shiftDate(offset + 9),
    contractStart: shiftDate(offset + 20),
    contractEnd: shiftDate(offset + 22),
    moveIn: "202905",
    builder: "데모건설",
    developer: "데모시행",
    homepage: "",
    url: "https://www.applyhome.co.kr",
    overheated: false,
    adjusted: false,
    priceCap: offset > 0,
    redevelopment: offset < 0,
    publicZone: false,
  };
}

export function demoAnnouncements(label: string): Announcement[] {
  const addr = label.startsWith("서울") || label.startsWith("경기") ? label : `${label} 데모동 1`;
  return [
    demoAnnouncement("DEMO-1", "(데모) 리버파크 자이", `${addr} 데모동 1`, 7),
    demoAnnouncement("DEMO-2", "(데모) 센트럴 푸르지오", `${addr} 데모동 2`, -1),
    demoAnnouncement("DEMO-3", "(데모) 더샵 퍼스트", `${addr} 데모동 3`, -60),
  ];
}

export function demoPresaleDetail(no: string) {
  const a = demoAnnouncements("서울특별시 강남구").find((x) => x.houseManageNo === no);
  if (!a) return null;
  const models: HouseModel[] = [
    { modelNo: "01", houseType: "059.9800A", area: 59.98, supplyArea: 84.2, general: 120, special: 90, topPrice: 105000 },
    { modelNo: "02", houseType: "084.9700A", area: 84.97, supplyArea: 112.5, general: 150, special: 70, topPrice: 139000 },
    { modelNo: "03", houseType: "114.9300A", area: 114.93, supplyArea: 148.1, general: 50, special: 0, topPrice: 185000 },
  ];
  const competition: Competition[] = a.houseManageNo === "DEMO-3"
    ? models.map((m, i) => ({ modelNo: m.modelNo, houseType: m.houseType, rank: "1", reside: "해당지역", supply: m.general, requests: m.general * (40 + i * 25), rate: String(40 + i * 25) }))
    : [];
  const scores: Score[] = a.houseManageNo === "DEMO-3"
    ? models.map((m, i) => ({ modelNo: m.modelNo, houseType: m.houseType, reside: "해당지역", low: 58 + i * 3, avg: 64 + i * 2, high: 74 + i }))
    : [];
  return { announcement: a, models, competition, scores };
}
