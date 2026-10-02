// K-apt(공동주택관리정보시스템) 단지 정보 + 건축물대장(건폐율·용적률).
// 모두 공공데이터포털 인증키(DATA_GO_KR_KEY) 하나로 호출하며, API마다 활용신청이 필요.
import "server-only";
import { callDataGoKr, num, str, type RawItem } from "./dataGoKr";
import { normalizeName } from "./analysis";
import { DAY, memo } from "./memo";

const APT_LIST = "https://apis.data.go.kr/1613000/AptListService4/getSigunguAptList4";
const APT_BASIC = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5";
const APT_DETAIL = "https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5";
const BLD_RECAP = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo";
const BLD_TITLE = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

export type KaptInfo = {
  kaptCode: string;
  kaptName: string;
  bjdCode: string; // 법정동코드 10자리
  households: number | null; // 세대수
  dongCount: number | null;
  useDate: string | null; // 사용승인일 YYYYMMDD
  topFloor: number | null;
  hallType: string | null; // 계단식/복도식/혼합식
  builder: string | null;
  heating: string | null;
  roadAddress: string | null;
  parkingPerHousehold: number | null;
  subway: string | null; // "2호선 성수역"
  subwayWalk: string | null; // "5~10분이내"
};

export type BuildingInfo = { coverageRatio: number | null; floorAreaRatio: number | null };

type ListItem = { kaptCode: string; kaptName: string; bjdCode: string; dong: string };

function listSigungu(lawd: string): Promise<ListItem[]> {
  return memo(`kapt-list:${lawd}`, 7 * DAY, async () => {
    const out: ListItem[] = [];
    for (let page = 1; page <= 10; page++) {
      const { items, totalCount } = await callDataGoKr(APT_LIST, { sigunguCode: lawd, numOfRows: 1000, pageNo: page }, "K-apt 단지목록 API");
      for (const it of items) {
        out.push({ kaptCode: str(it.kaptCode), kaptName: str(it.kaptName), bjdCode: str(it.bjdCode), dong: str(it.as3) || str(it.as4) });
      }
      if (page * 1000 >= totalCount) break;
    }
    return out;
  });
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// 영문/한글로 혼용되는 브랜드명 통일 (실거래 "역삼I'PARK" ↔ K-apt "역삼아이파크" 등)
const BRAND_ALIASES: [RegExp, string][] = [
  [/i'?park/g, "아이파크"],
  [/xi/g, "자이"],
  [/e편한세상|이-?편한세상/g, "e편한세상"],
  [/sk ?view|skview/g, "sk뷰"],
  [/hillstate/g, "힐스테이트"],
  [/prugio/g, "푸르지오"],
  [/raemian/g, "래미안"],
  [/thesharp|the#/g, "더샵"],
  [/lotte ?castle/g, "롯데캐슬"],
  [/'/g, ""],
];

function canonicalName(s: string): string {
  let n = normalizeName(s);
  for (const [re, to] of BRAND_ALIASES) n = n.replace(re, to);
  return n.replace(/아파트$/, "");
}

/** 단지명 유사도 (0~1). 포함관계면 높게, 아니면 글자 2-gram 겹침. */
export function nameSimilarity(a: string, b: string): number {
  const x = canonicalName(a);
  const y = canonicalName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9;
  const bx = bigrams(x);
  const by = bigrams(y);
  let common = 0;
  for (const g of bx) if (by.has(g)) common++;
  return (2 * common) / (bx.size + by.size || 1);
}

/** 실거래 단지(법정동+단지명)에 해당하는 K-apt 단지 찾기. */
/** 실거래 단지(법정동+단지명)에 해당하는 K-apt 후보 (유사도 0.6 이상, 높은 순 최대 3개) */
export function matchKaptCandidates(list: ListItem[], umdNm: string, aptNm: string): ListItem[] {
  return list
    .map((it) => {
      let score = nameSimilarity(it.kaptName, aptNm);
      if (it.dong && umdNm) score += it.dong === umdNm ? 0.2 : -0.3;
      return { it, score };
    })
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.it);
}

export function matchKapt(list: ListItem[], umdNm: string, aptNm: string): ListItem | null {
  return matchKaptCandidates(list, umdNm, aptNm)[0] ?? null;
}

/** 입주년도 허용 오차: 실거래 건축년도와 K-apt 사용승인년도가 이 이상 차이 나면 다른 단지로 판단 */
export const USE_YEAR_TOLERANCE = 3;

const orNull = <T,>(v: T | 0 | "") => (v === 0 || v === "" ? null : v);

/**
 * K-apt 단지 정보. 이름이 비슷한 후보를 순서대로 보며, 실거래 건축년도(buildYear)와 사용승인년도가
 * ±3년 안인 첫 단지를 채택 (같은 동에 이름이 비슷한 다른 단지가 잘못 붙는 것 방지).
 */
export async function getKaptInfo(lawd: string, umdNm: string, aptNm: string, buildYear?: number | null): Promise<KaptInfo | null> {
  const list = await listSigungu(lawd);
  for (const hit of matchKaptCandidates(list, umdNm, aptNm)) {
    const info = await loadKaptInfo(hit);
    const useYear = Number(info.useDate?.slice(0, 4));
    if (!buildYear || !useYear || Math.abs(useYear - buildYear) <= USE_YEAR_TOLERANCE) return info;
  }
  return null;
}

function loadKaptInfo(hit: ListItem): Promise<KaptInfo> {
  return memo(`kapt-info:${hit.kaptCode}`, 7 * DAY, async () => {
    const [basic, detail] = await Promise.allSettled([
      callDataGoKr(APT_BASIC, { kaptCode: hit.kaptCode }, "K-apt 기본정보 API"),
      callDataGoKr(APT_DETAIL, { kaptCode: hit.kaptCode }, "K-apt 상세정보 API"),
    ]);
    if (basic.status === "rejected") throw basic.reason;
    const b: RawItem = basic.value.items[0] ?? {};
    const d: RawItem = detail.status === "fulfilled" ? (detail.value.items[0] ?? {}) : {};
    const households = orNull(num(b.kaptdaCnt) || num(b.hoCnt));
    const parking = num(d.kaptdPcnt) + num(d.kaptdPcntu);
    const subwayLine = str(d.subwayLine);
    const subwayStation = str(d.subwayStation);
    return {
      kaptCode: hit.kaptCode,
      kaptName: str(b.kaptName) || hit.kaptName,
      bjdCode: str(b.bjdCode) || hit.bjdCode,
      households,
      dongCount: orNull(num(b.kaptDongCnt)),
      useDate: orNull(str(b.kaptUsedate)),
      topFloor: orNull(num(b.kaptTopFloor)),
      hallType: orNull(str(b.codeHallNm)),
      builder: orNull(str(b.kaptBcompany)),
      heating: orNull(str(b.codeHeatNm)),
      roadAddress: orNull(str(b.doroJuso)),
      parkingPerHousehold: parking && households ? parking / households : null,
      subway: subwayStation ? `${subwayLine ? `${subwayLine} ` : ""}${subwayStation}`.trim() : null,
      subwayWalk: orNull(str(d.kaptdWtimesub)),
    };
  });
}

/** 건축물대장 총괄표제부(없으면 표제부 중 최대값)에서 건폐율·용적률. jibun: "670-22" */
export function getBuildingInfo(bjdCode: string, jibun: string): Promise<BuildingInfo | null> {
  const [bun, ji = "0"] = jibun.replace(/[^0-9-]/g, "").split("-");
  if (bjdCode.length !== 10 || !bun) return Promise.resolve(null);
  const params = {
    sigunguCd: bjdCode.slice(0, 5),
    bjdongCd: bjdCode.slice(5, 10),
    bun: bun.padStart(4, "0"),
    ji: ji.padStart(4, "0"),
    numOfRows: 100,
    pageNo: 1,
  };
  return memo(`bld:${bjdCode}:${jibun}`, 30 * DAY, async () => {
    const pick = (items: RawItem[]) => {
      const bc = Math.max(0, ...items.map((i) => num(i.bcRat)));
      const vl = Math.max(0, ...items.map((i) => num(i.vlRat)));
      return bc || vl ? { coverageRatio: bc || null, floorAreaRatio: vl || null } : null;
    };
    const recap = await callDataGoKr(BLD_RECAP, params, "건축물대장 총괄표제부 API");
    const r = pick(recap.items);
    if (r) return r;
    const title = await callDataGoKr(BLD_TITLE, params, "건축물대장 표제부 API");
    return pick(title.items);
  });
}
