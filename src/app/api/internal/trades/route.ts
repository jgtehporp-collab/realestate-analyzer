// 급등·급락 일일 계산(GitHub Actions)용 실거래 프록시.
// 공공데이터포털이 해외망(GitHub 러너) 접속을 막는 경우가 있어, 서울 리전(icn1)의 이 함수를 거쳐 조회.
// HOT_BUILD_SECRET 환경변수와 같은 Bearer 토큰이 있어야 응답 (없으면 비활성).
import type { NextRequest } from "next/server";
import { fetchTrades } from "@/lib/molit";
import { geocodeRegion } from "@/lib/location";
import { findRegion, regionLabel } from "@/lib/regions";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.HOT_BUILD_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const lawd = request.nextUrl.searchParams.get("lawd") ?? "";
  const months = (request.nextUrl.searchParams.get("months") ?? "").split(",").filter((m) => /^\d{6}$/.test(m));
  if (!findRegion(lawd) || months.length === 0 || months.length > 12) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  try {
    // center=1 이면 지도 라벨용 구 대표 좌표도 함께 (실패해도 거래 자료는 반환)
    const [trades, center] = await Promise.all([
      fetchTrades(lawd, months),
      request.nextUrl.searchParams.get("center") === "1" ? geocodeRegion(regionLabel(lawd)).catch(() => null) : null,
    ]);
    return Response.json({ ...trades, center });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 502 });
  }
}
