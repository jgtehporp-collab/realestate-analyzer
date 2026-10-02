// 공공데이터포털(data.go.kr) 공통 호출 유틸. JSON/XML 응답을 모두 처리.
import "server-only";

export type RawItem = Record<string, unknown>;

export const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
export const str = (v: unknown) => String(v ?? "").trim();

export function getServiceKey(): string | null {
  const key = process.env.DATA_GO_KR_KEY?.trim();
  return key ? key : null;
}

function parseXml(text: string) {
  const pick = (tag: string) => text.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "";
  const items: RawItem[] = [];
  for (const m of text.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const item: RawItem = {};
    for (const f of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) item[f[1]] = f[2];
    items.push(item);
  }
  // 단건 조회 API는 <item> 없이 <body> 아래에 필드가 바로 오기도 함
  if (!items.length) {
    const body = text.match(/<body>([\s\S]*?)<\/body>/)?.[1];
    if (body && !/<items/.test(body)) {
      const item: RawItem = {};
      for (const f of body.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) item[f[1]] = f[2];
      if (Object.keys(item).length) items.push(item);
    }
  }
  return {
    items,
    totalCount: num(pick("totalCount")),
    resultCode: pick("resultCode") || pick("returnReasonCode"),
    resultMsg: pick("resultMsg") || pick("returnAuthMsg") || pick("errMsg"),
  };
}

// 공공데이터포털 초당 호출 제한(429 LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND) 대비: 동시 호출 수 제한
const MAX_CONCURRENT = 4;
let active = 0;
const waiters: (() => void)[] = [];
async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 동시 호출 제한 + 429(초당 한도 초과) 시 잠시 후 최대 3회 재시도 */
async function limitedFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await acquire();
    let res: Response;
    try {
      res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    } finally {
      release();
    }
    if (res.status !== 429 || attempt >= 3) return res;
    await sleep(1500 * (attempt + 1));
  }
}

/** data.go.kr API 호출. params에 serviceKey는 넣지 않음(자동 추가). */
export async function callDataGoKr(
  endpoint: string,
  params: Record<string, string | number>,
  label: string,
): Promise<{ items: RawItem[]; totalCount: number }> {
  const key = getServiceKey();
  if (!key) throw new Error("DATA_GO_KR_KEY가 설정되지 않았습니다.");
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const qs = Object.entries({ ...params, _type: "json" })
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const res = await limitedFetch(`${endpoint}?serviceKey=${serviceKey}&${qs}`);
  const text = await res.text();
  if (!res.ok) {
    // 게이트웨이 오류는 XML(OpenAPI_ServiceResponse)로 사유가 옴
    const reason = text.match(/<returnAuthMsg>([^<]*)</)?.[1] ?? text.match(/<errMsg>([^<]*)</)?.[1] ?? text.slice(0, 120);
    throw new Error(`${label} HTTP ${res.status}: ${reason.trim()}`);
  }

  let items: RawItem[];
  let totalCount: number;
  let resultCode: string;
  let resultMsg: string;
  if (text.trimStart().startsWith("<")) {
    ({ items, totalCount, resultCode, resultMsg } = parseXml(text));
  } else {
    const data = JSON.parse(text);
    const header = data?.response?.header ?? {};
    const body = data?.response?.body ?? {};
    const raw = body.items?.item ?? body.item ?? (body.items && !Array.isArray(body.items) && typeof body.items === "object" ? null : body.items);
    items = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];
    totalCount = num(body.totalCount);
    resultCode = str(header.resultCode);
    resultMsg = str(header.resultMsg);
  }
  if (resultCode && !/^0+$/.test(resultCode)) {
    throw new Error(`${label} 오류 (${resultCode}) ${resultMsg}`);
  }
  return { items, totalCount };
}
