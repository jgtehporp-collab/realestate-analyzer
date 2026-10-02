// 분구 지역의 실제 조회 코드 목록 (이전 코드 + 카카오로 확인한 신규 구 코드).
import "server-only";
import { regionSigunguCode } from "./location";
import { SPLIT_DISTRICTS } from "./regions";

export async function sourceCodesFor(lawd: string): Promise<string[]> {
  const parts = SPLIT_DISTRICTS[lawd];
  if (!parts) return [lawd];
  const resolved = await Promise.all(parts.map((p) => regionSigunguCode(p).catch(() => null)));
  return [lawd, ...new Set(resolved.filter((c): c is string => !!c && c !== lawd))];
}
