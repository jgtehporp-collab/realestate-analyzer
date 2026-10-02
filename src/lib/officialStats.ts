// 공식 통계: 한국부동산원 R-ONE 주간 아파트 매매가격지수, KOSIS 주민등록인구 (시군구).
// 일일 작업에서 Vercel 서울 리전 프록시(/api/internal/stats)를 거쳐 받음.
import "server-only";
import { DAY, HOUR, memo } from "./memo";

const REB_BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do";
/** (주) 매매가격지수 */
export const REB_SALE_INDEX = "T244183132827305";
const KOSIS_URL = "https://kosis.kr/openapi/Param/statisticsParameterData.do";

export const rebKey = () => (process.env.REB_KEY || process.env.RONE_API_KEY || process.env.R_ONE_KEY || "").trim() || null;
export const kosisKey = () => (process.env.KOSIS_API_KEY || process.env.KOSIS_KEY || "").trim() || null;

export type RebRow = { cls: string; full: string; week: string; desc: string; value: number };
export type PopRow = { code: string; name: string; ym: string; value: number };

async function getJson(url: string, label: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 150)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} 응답 해석 실패: ${text.slice(0, 150)}`);
  }
}

/** R-ONE 주간 매매가격지수, 주차(YYYYWW) 구간의 서울·경기 행만 */
export function fetchRebWeekly(startWeek: string, endWeek: string): Promise<RebRow[]> {
  const key = rebKey();
  if (!key) throw new Error("REB_KEY(R-ONE 인증키)가 설정되지 않았습니다.");
  return memo(`reb:${startWeek}:${endWeek}`, 6 * HOUR, async () => {
    const out: RebRow[] = [];
    for (let page = 1; page <= 40; page++) {
      const url =
        `${REB_BASE}?KEY=${encodeURIComponent(key)}&Type=json&pIndex=${page}&pSize=1000` +
        `&STATBL_ID=${REB_SALE_INDEX}&DTACYCLE_CD=WK&START_WRTTIME=${startWeek}&END_WRTTIME=${endWeek}`;
      const data = (await getJson(url, "R-ONE API")) as Record<string, unknown>;
      const result = data.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
      if (result) {
        if (result.CODE === "INFO-200") break; // 데이터 없음
        throw new Error(`R-ONE API 오류 (${result.CODE}) ${result.MESSAGE ?? ""}`);
      }
      const block = (data.SttsApiTblData ?? []) as { head?: { list_total_count?: number }[]; row?: Record<string, unknown>[] }[];
      const total = Number(block.flatMap((b) => b.head ?? []).find((h) => h.list_total_count !== undefined)?.list_total_count ?? 0);
      const rows = block.flatMap((b) => b.row ?? []);
      for (const r of rows) {
        const full = String(r.CLS_FULLNM ?? r.CLS_NM ?? "").trim();
        if (!/^(서울|경기)/.test(full)) continue;
        const value = Number(r.DTA_VAL);
        if (!Number.isFinite(value)) continue;
        out.push({
          cls: String(r.CLS_NM ?? "").trim(),
          full,
          week: String(r.WRTTIME_IDTFR_ID ?? ""),
          desc: String(r.WRTTIME_DESC ?? "").trim(),
          value,
        });
      }
      if (!rows.length || page * 1000 >= total) break;
    }
    return out;
  });
}

/** KOSIS 주민등록인구(행정구역 시군구별, 월) 최근 13개월 총인구 - 서울(11)·경기(41)만 */
export function fetchKosisPopulation(): Promise<PopRow[]> {
  const key = kosisKey();
  if (!key) throw new Error("KOSIS_API_KEY가 설정되지 않았습니다.");
  return memo("kosis:pop", DAY, async () => {
    const url =
      `${KOSIS_URL}?method=getList&apiKey=${encodeURIComponent(key)}&itmId=T20+&objL1=ALL&objL2=&objL3=&objL4=&objL5=&objL6=&objL7=&objL8=` +
      `&format=json&jsonVD=Y&prdSe=M&newEstPrdCnt=13&orgId=101&tblId=DT_1B040A3`;
    const data = await getJson(url, "KOSIS API");
    if (!Array.isArray(data)) {
      const d = data as { err?: string; errMsg?: string };
      throw new Error(`KOSIS API 오류 (${d.err ?? "?"}) ${d.errMsg ?? JSON.stringify(data).slice(0, 120)}`);
    }
    return (data as Record<string, unknown>[])
      .map((r) => ({
        code: String(r.C1 ?? "").replace(/\D/g, ""),
        name: String(r.C1_NM ?? "").trim(),
        ym: String(r.PRD_DE ?? ""),
        value: Number(String(r.DT ?? "").replace(/,/g, "")),
      }))
      .filter((r) => /^(11|41)/.test(r.code) && Number.isFinite(r.value));
  });
}

/** KST 기준 n주 전 ~ 이번 주의 R-ONE 주차 식별자(YYYYWW, ISO 주차 근사) */
export function weekId(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}${String(week).padStart(2, "0")}`;
}
