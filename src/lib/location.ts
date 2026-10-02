// 단지 좌표(VWorld 지오코더 → 카카오 주소검색 순) + 반경 1km 생활편의시설(카카오 로컬) + 환경/학군 등급.
import "server-only";
import { DAY, memo } from "./memo";

export type PoiType = "elementary" | "middle" | "high" | "subway" | "mart" | "hospital" | "academy" | "park";

export type Poi = { type: PoiType; name: string; lat: number; lng: number; distance: number };

export type Grade = { grade: "S" | "A" | "B" | "C"; score: number; max: number; reasons: string[] };

export type LocationInfo = {
  lat: number;
  lng: number;
  geocoder: "vworld" | "kakao";
  pois: Poi[] | null; // 카카오 키 없으면 null
  counts: Partial<Record<PoiType, number>>;
  env: Grade | null;
  school: Grade | null;
};

export const POI_LABELS: Record<PoiType, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  subway: "지하철역",
  mart: "대형마트",
  hospital: "병원",
  academy: "학원",
  park: "공원",
};

const RADIUS = 1000;

export const vworldKey = () => process.env.VWORLD_API_KEY?.trim() || null;
export const kakaoKey = () => process.env.KAKAO_REST_API_KEY?.trim() || null;

async function geocodeVworld(address: string, key: string): Promise<{ lat: number; lng: number } | null> {
  for (const type of ["parcel", "road"]) {
    const url =
      `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326` +
      `&refine=true&simple=true&format=json&type=${type}&address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}` +
      (process.env.VWORLD_DOMAIN ? `&domain=${encodeURIComponent(process.env.VWORLD_DOMAIN)}` : "");
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    const point = data?.response?.result?.point;
    if (data?.response?.status === "OK" && point) return { lat: Number(point.y), lng: Number(point.x) };
    if (data?.response?.status === "ERROR") throw new Error(`VWorld 지오코더 오류: ${data.response.error?.text ?? ""}`);
  }
  return null;
}

async function kakao(path: string, params: Record<string, string | number>, key: string) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`https://dapi.kakao.com${path}?${qs}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`카카오 로컬 API HTTP ${res.status}`);
  return res.json();
}

async function geocodeKakao(address: string, key: string): Promise<{ lat: number; lng: number } | null> {
  const data = await kakao("/v2/local/search/address.json", { query: address, size: 1 }, key);
  const doc = data?.documents?.[0];
  return doc ? { lat: Number(doc.y), lng: Number(doc.x) } : null;
}

type KakaoDoc = { place_name: string; category_name: string; x: string; y: string; distance: string };

async function searchPois(lat: number, lng: number, key: string) {
  const base = { x: lng, y: lat, radius: RADIUS, sort: "distance", size: 15 };
  const byCategory = (code: string) => kakao("/v2/local/search/category.json", { ...base, category_group_code: code }, key);
  const byKeyword = (query: string) => kakao("/v2/local/search/keyword.json", { ...base, query }, key);

  // 학교는 초/중/고 구분 위해 최대 3페이지
  const schoolPages = await Promise.all([1, 2, 3].map((page) => kakao("/v2/local/search/category.json", { ...base, category_group_code: "SC4", page }, key)));
  const [subway, mart, hospital, academy, park] = await Promise.all([
    byCategory("SW8"),
    byCategory("MT1"),
    byCategory("HP8"),
    byCategory("AC5"),
    byKeyword("공원"),
  ]);

  const toPoi = (type: PoiType) => (d: KakaoDoc): Poi => ({
    type,
    name: d.place_name,
    lat: Number(d.y),
    lng: Number(d.x),
    distance: Number(d.distance),
  });

  const schools: KakaoDoc[] = [];
  const seen = new Set<string>();
  for (const p of schoolPages) {
    for (const d of (p?.documents ?? []) as KakaoDoc[]) {
      if (seen.has(d.place_name)) continue;
      seen.add(d.place_name);
      schools.push(d);
    }
  }
  const schoolType = (d: KakaoDoc): PoiType | null =>
    /초등학교/.test(d.category_name) || /초등학교$/.test(d.place_name)
      ? "elementary"
      : /중학교/.test(d.category_name) || /중학교$/.test(d.place_name)
        ? "middle"
        : /고등학교/.test(d.category_name) || /고등학교$/.test(d.place_name)
          ? "high"
          : null;

  const pois: Poi[] = [];
  for (const d of schools) {
    const t = schoolType(d);
    if (t) pois.push(toPoi(t)(d));
  }
  // 지하철역은 같은 역의 출구/노선이 여러 개로 나와서 역 이름 기준 중복 제거
  const stations = new Map<string, KakaoDoc>();
  for (const d of (subway?.documents ?? []) as KakaoDoc[]) {
    const name = d.place_name.replace(/\s*\S+호선$|\s*\S+선$/, "").trim();
    if (!stations.has(name)) stations.set(name, { ...d, place_name: name });
  }
  pois.push(...[...stations.values()].map(toPoi("subway")));
  pois.push(...((mart?.documents ?? []) as KakaoDoc[]).map(toPoi("mart")));
  pois.push(...((hospital?.documents ?? []) as KakaoDoc[]).slice(0, 8).map(toPoi("hospital")));
  pois.push(...((academy?.documents ?? []) as KakaoDoc[]).slice(0, 8).map(toPoi("academy")));
  pois.push(
    ...((park?.documents ?? []) as KakaoDoc[])
      .filter((d) => /공원|하천|천$|강$/.test(d.category_name) || /공원$/.test(d.place_name))
      .map(toPoi("park")),
  );

  const total = (r: { meta?: { total_count?: number } }) => Number(r?.meta?.total_count ?? 0);
  const counts: Partial<Record<PoiType, number>> = {
    elementary: pois.filter((p) => p.type === "elementary").length,
    middle: pois.filter((p) => p.type === "middle").length,
    high: pois.filter((p) => p.type === "high").length,
    subway: stations.size,
    mart: total(mart),
    hospital: total(hospital),
    academy: total(academy),
    park: pois.filter((p) => p.type === "park").length,
  };
  return { pois, counts };
}

const toGrade = (score: number, max: number, reasons: string[]): Grade => ({
  grade: score >= max * 0.85 ? "S" : score >= max * 0.65 ? "A" : score >= max * 0.4 ? "B" : "C",
  score,
  max,
  reasons,
});

const nearest = (pois: Poi[], type: PoiType) =>
  pois.filter((p) => p.type === type).reduce<Poi | null>((a, b) => (!a || b.distance < a.distance ? b : a), null);

const m = (d: number) => (d >= 1000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`);

/** 학군: 초등학교 거리, 중·고 수, 학원 수 (최대 9점) */
export function schoolGrade(pois: Poi[], counts: Partial<Record<PoiType, number>>): Grade {
  let s = 0;
  const reasons: string[] = [];
  const el = nearest(pois, "elementary");
  if (el) {
    s += el.distance <= 300 ? 3 : el.distance <= 500 ? 2 : 1;
    reasons.push(`초 ${m(el.distance)}`);
  }
  const mid = counts.middle ?? 0;
  s += mid >= 2 ? 2 : mid;
  if (mid) reasons.push(`중 ${mid}곳`);
  if ((counts.high ?? 0) > 0) s += 1;
  const ac = counts.academy ?? 0;
  s += ac >= 100 ? 3 : ac >= 30 ? 2 : ac >= 5 ? 1 : 0;
  reasons.push(`학원 ${ac}곳`);
  return toGrade(s, 9, reasons);
}

/** 환경: 역세권, 대형마트, 병원, 공원 (최대 9점) */
export function envGrade(pois: Poi[], counts: Partial<Record<PoiType, number>>): Grade {
  let s = 0;
  const reasons: string[] = [];
  const st = nearest(pois, "subway");
  if (st) {
    s += st.distance <= 500 ? 3 : 2;
    reasons.push(`${st.name} ${m(st.distance)}`);
  } else reasons.push("1km 내 역 없음");
  const mart = counts.mart ?? 0;
  s += mart >= 2 ? 2 : mart;
  if (mart) reasons.push(`마트 ${mart}`);
  const hos = counts.hospital ?? 0;
  s += hos >= 30 ? 2 : hos >= 5 ? 1 : 0;
  const park = counts.park ?? 0;
  s += park >= 3 ? 2 : park;
  if (park) reasons.push(`공원 ${park}`);
  return toGrade(s, 9, reasons);
}

export function getLocation(address: string, fallbackAddress?: string): Promise<LocationInfo | null> {
  const vk = vworldKey();
  const kk = kakaoKey();
  if (!vk && !kk) return Promise.resolve(null);
  return memo(`loc:${address}`, 7 * DAY, async () => {
    let point: { lat: number; lng: number } | null = null;
    let geocoder: LocationInfo["geocoder"] = "vworld";
    const candidates = [address, fallbackAddress].filter((a): a is string => !!a);
    if (vk) {
      for (const a of candidates) {
        point = await geocodeVworld(a, vk).catch(() => null);
        if (point) break;
      }
    }
    if (!point && kk) {
      geocoder = "kakao";
      for (const a of candidates) {
        point = await geocodeKakao(a, kk).catch(() => null);
        if (point) break;
      }
    }
    if (!point) return null;
    if (!kk) return { ...point, geocoder, pois: null, counts: {}, env: null, school: null };
    const { pois, counts } = await searchPois(point.lat, point.lng, kk);
    return { ...point, geocoder, pois, counts, env: envGrade(pois, counts), school: schoolGrade(pois, counts) };
  });
}

/** 행정구역(예: "서울특별시 강남구") 대표 좌표 - 지도 라벨 위치용. 카카오 주소검색 우선, 없으면 VWorld. */
export function geocodeRegion(name: string): Promise<{ lat: number; lng: number } | null> {
  const kk = kakaoKey();
  const vk = vworldKey();
  if (!kk && !vk) return Promise.resolve(null);
  return memo(`region-geo:${name}`, 30 * DAY, async () => {
    if (kk) {
      const p = await geocodeKakao(name, kk).catch(() => null);
      if (p) return p;
    }
    return vk ? geocodeVworld(name, vk).catch(() => null) : null;
  });
}

/** 행정구역명 → 시군구 코드(법정동코드 앞 5자리), 카카오 주소검색 b_code 기준 */
export function regionSigunguCode(name: string): Promise<string | null> {
  const kk = kakaoKey();
  if (!kk) return Promise.resolve(null);
  return memo(`region-bcode:${name}`, 30 * DAY, async () => {
    const data = await kakao("/v2/local/search/address.json", { query: name, size: 1 }, kk);
    const b = String(data?.documents?.[0]?.address?.b_code ?? "");
    return /^\d{10}$/.test(b) ? b.slice(0, 5) : null;
  });
}
