// 한국부동산원 청약홈 API (api.odcloud.kr). 공공데이터포털 인증키(DATA_GO_KR_KEY)로 호출하며
// "청약홈 분양정보 조회 서비스", "청약홈 청약접수 경쟁률 및 특별공급 신청현황 조회 서비스" 활용신청 필요.
import "server-only";
import { getServiceKey, num, str } from "./dataGoKr";
import { HOUR, memo } from "./memo";

const BASE = "https://api.odcloud.kr/api";
const SCORE = `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getAptLttotPblancScore`;

/** apt: 일반 APT 분양 / remndr: 무순위·불법행위 재공급(줍줍) / opt: 임의공급(선착순 성격) */
export type AnnKind = "apt" | "remndr" | "opt";

const EP: Record<AnnKind, { detail: string; models: string; cmpet: string; dateCompact: boolean }> = {
  apt: {
    detail: `${BASE}/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancDetail`,
    models: `${BASE}/ApplyhomeInfoDetailSvc/v1/getAPTLttotPblancMdl`,
    cmpet: `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getAPTLttotPblancCmpet`,
    dateCompact: false,
  },
  remndr: {
    detail: `${BASE}/ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancDetail`,
    models: `${BASE}/ApplyhomeInfoDetailSvc/v1/getRemndrLttotPblancMdl`,
    cmpet: `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getRemndrLttotPblancCmpet`,
    dateCompact: false,
  },
  opt: {
    detail: `${BASE}/ApplyhomeInfoDetailSvc/v1/getOPTLttotPblancDetail`,
    models: `${BASE}/ApplyhomeInfoDetailSvc/v1/getOPTLttotPblancMdl`,
    cmpet: `${BASE}/ApplyhomeInfoCmpetRtSvc/v1/getOPTLttotPblancCmpet`,
    dateCompact: true, // 임의공급은 모집공고일이 YYYYMMDD
  },
};

export const isAnnKind = (k: string): k is AnnKind => k === "apt" || k === "remndr" || k === "opt";

/** 20260918 → 2026-09-18 (이미 대시 형식이면 그대로) */
const day = (v: unknown) => {
  const t = str(v);
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : t;
};

type Raw = Record<string, unknown>;

async function callOdcloud(endpoint: string, cond: Record<string, string>, label: string, perPage = 100): Promise<Raw[]> {
  const key = getServiceKey();
  if (!key) throw new Error("DATA_GO_KR_KEY가 설정되지 않았습니다.");
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const out: Raw[] = [];
  for (let page = 1; page <= 10; page++) {
    const qs = [`page=${page}`, `perPage=${perPage}`, "returnType=JSON", `serviceKey=${serviceKey}`]
      .concat(Object.entries(cond).map(([k, v]) => `${encodeURIComponent(`cond[${k}]`)}=${encodeURIComponent(v)}`))
      .join("&");
    const res = await fetch(`${endpoint}?${qs}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    let data: { data?: Raw[]; matchCount?: number; totalCount?: number; code?: number; msg?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 120)}`);
    }
    if (!res.ok || (typeof data.code === "number" && data.code < 0)) {
      throw new Error(`${label} 오류 (${data.code ?? res.status}) ${data.msg ?? ""}`.trim());
    }
    const rows = data.data ?? [];
    out.push(...rows);
    const total = Number(data.matchCount ?? data.totalCount ?? 0);
    if (rows.length < perPage || page * perPage >= total) break;
  }
  return out;
}

export type Announcement = {
  kind: AnnKind;
  kindLabel: string; // 무순위 / 불법행위 재공급 / 임의공급 / APT
  houseManageNo: string;
  pblancNo: string;
  name: string;
  houseType: string; // APT / 민간사전청약 / 신혼희망타운
  saleType: string; // 민영 / 국민
  address: string;
  households: number;
  noticeDate: string; // 모집공고일 YYYY-MM-DD
  specialStart: string;
  specialEnd: string;
  receiptStart: string;
  receiptEnd: string;
  rank1Local: string;
  winnerDate: string;
  contractStart: string;
  contractEnd: string;
  moveIn: string; // YYYYMM
  builder: string;
  developer: string;
  homepage: string;
  url: string;
  overheated: boolean; // 투기과열지구
  adjusted: boolean; // 조정대상지역
  priceCap: boolean; // 분양가상한제
  redevelopment: boolean; // 정비사업
  publicZone: boolean; // 공공주택지구
};

const yes = (v: unknown) => str(v).toUpperCase() === "Y";

function toAnnouncement(r: Raw, kind: AnnKind): Announcement {
  const receiptStart = day(r.RCEPT_BGNDE) || day(r.SUBSCRPT_RCEPT_BGNDE) || day(r.GNRL_RCEPT_BGNDE);
  return {
    kind,
    kindLabel: kind === "opt" ? "임의공급" : str(r.HOUSE_SECD_NM) || (kind === "remndr" ? "무순위" : "APT"),
    houseManageNo: str(r.HOUSE_MANAGE_NO),
    pblancNo: str(r.PBLANC_NO),
    name: str(r.HOUSE_NM),
    houseType: str(r.HOUSE_SECD_NM),
    saleType: str(r.HOUSE_DTL_SECD_NM),
    address: str(r.HSSPLY_ADRES),
    households: num(r.TOT_SUPLY_HSHLDCO),
    noticeDate: day(r.RCRIT_PBLANC_DE),
    specialStart: day(r.SPSPLY_RCEPT_BGNDE),
    specialEnd: day(r.SPSPLY_RCEPT_ENDDE),
    receiptStart,
    receiptEnd: day(r.RCEPT_ENDDE) || day(r.SUBSCRPT_RCEPT_ENDDE) || day(r.GNRL_RCEPT_ENDDE),
    rank1Local: day(r.GNRL_RNK1_CRSPAREA_RCPTDE) || (kind === "apt" ? "" : receiptStart),
    winnerDate: day(r.PRZWNER_PRESNATN_DE),
    contractStart: day(r.CNTRCT_CNCLS_BGNDE),
    contractEnd: day(r.CNTRCT_CNCLS_ENDDE),
    moveIn: str(r.MVN_PREARNGE_YM),
    builder: str(r.CNSTRCT_ENTRPS_NM),
    developer: str(r.BSNS_MBY_NM),
    homepage: str(r.HMPG_ADRES),
    url: str(r.PBLANC_URL),
    overheated: yes(r.SPECLT_RDN_EARTH_AT),
    adjusted: yes(r.MDAT_TRGET_AREA_SECD),
    priceCap: yes(r.PARCPRC_ULS_AT),
    redevelopment: yes(r.IMPRMN_BSNS_AT),
    publicZone: yes(r.PUBLIC_HOUSE_EARTH_AT),
  };
}

/** 공급위치 주소에 keyword가 포함된 분양공고 (모집공고일 since(YYYY-MM-DD) 이후). */
export function listAnnouncements(keyword: string, since: string, kind: AnnKind = "apt"): Promise<Announcement[]> {
  return memo(`ah-list:${kind}:${keyword}:${since}`, 3 * HOUR, async () => {
    const ep = EP[kind];
    const rows = await callOdcloud(
      ep.detail,
      { "HSSPLY_ADRES::LIKE": keyword, "RCRIT_PBLANC_DE::GTE": ep.dateCompact ? since.replaceAll("-", "") : since },
      kind === "apt" ? "청약홈 분양정보 API" : "청약홈 무순위·임의공급 API",
    );
    return rows.map((r) => toAnnouncement(r, kind));
  });
}

export function getAnnouncement(houseManageNo: string, kind: AnnKind = "apt"): Promise<Announcement | null> {
  return memo(`ah-one:${kind}:${houseManageNo}`, 3 * HOUR, async () => {
    const rows = await callOdcloud(EP[kind].detail, { "HOUSE_MANAGE_NO::EQ": houseManageNo }, "청약홈 분양정보 API", 10);
    return rows[0] ? toAnnouncement(rows[0], kind) : null;
  });
}

export type HouseModel = {
  modelNo: string;
  houseType: string; // "084.9800A"
  area: number; // 전용면적(㎡) - 주택형 앞 숫자
  supplyArea: number; // 공급면적
  general: number; // 일반공급 세대수
  special: number; // 특별공급 세대수
  topPrice: number; // 분양최고금액(만원)
};

export type Competition = { modelNo: string; houseType: string; rank: string; reside: string; supply: number; requests: number; rate: string };
export type Score = { modelNo: string; houseType: string; reside: string; low: number; high: number; avg: number };

export function getModels(houseManageNo: string, kind: AnnKind = "apt"): Promise<HouseModel[]> {
  return memo(`ah-mdl:${kind}:${houseManageNo}`, 12 * HOUR, async () => {
    const rows = await callOdcloud(EP[kind].models, { "HOUSE_MANAGE_NO::EQ": houseManageNo }, "청약홈 주택형 API");
    return rows
      .map((r) => ({
        modelNo: str(r.MODEL_NO),
        houseType: str(r.HOUSE_TY),
        area: parseFloat(str(r.HOUSE_TY)) || 0,
        supplyArea: num(r.SUPLY_AR),
        general: num(r.SUPLY_HSHLDCO),
        special: num(r.SPSPLY_HSHLDCO),
        topPrice: num(r.LTTOT_TOP_AMOUNT),
      }))
      .sort((a, b) => a.modelNo.localeCompare(b.modelNo));
  });
}

export function getCompetition(houseManageNo: string, kind: AnnKind = "apt"): Promise<Competition[]> {
  return memo(`ah-cmp:${kind}:${houseManageNo}`, 3 * HOUR, async () => {
    const rows = await callOdcloud(EP[kind].cmpet, { "HOUSE_MANAGE_NO::EQ": houseManageNo }, "청약홈 경쟁률 API");
    return rows.map((r) => ({
      modelNo: str(r.MODEL_NO),
      houseType: str(r.HOUSE_TY),
      rank: str(r.SUBSCRPT_RANK_CODE),
      reside: str(r.RESIDE_SENM),
      supply: num(r.SUPLY_HSHLDCO),
      requests: num(r.REQ_CNT),
      rate: str(r.CMPET_RATE),
    }));
  });
}

export function getScores(houseManageNo: string): Promise<Score[]> {
  return memo(`ah-score:${houseManageNo}`, 3 * HOUR, async () => {
    const rows = await callOdcloud(SCORE, { "HOUSE_MANAGE_NO::EQ": houseManageNo }, "청약홈 당첨가점 API");
    return rows.map((r) => ({
      modelNo: str(r.MODEL_NO),
      houseType: str(r.HOUSE_TY),
      reside: str(r.RESIDE_SENM),
      low: num(r.LWET_SCORE),
      high: num(r.TOP_SCORE),
      avg: num(r.AVRG_SCORE),
    }));
  });
}
