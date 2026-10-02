// 일일 작업용 공식 통계 프록시 (R-ONE 주간 매매가격지수 / KOSIS 주민등록인구). HOT_BUILD_SECRET 인증.
import type { NextRequest } from "next/server";
import { fetchKosisPopulation, fetchRebWeekly } from "@/lib/officialStats";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.HOT_BUILD_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  try {
    if (sp.get("src") === "reb") {
      const start = sp.get("start") ?? "";
      const end = sp.get("end") ?? "";
      if (!/^\d{6}$/.test(start) || !/^\d{6}$/.test(end)) return Response.json({ error: "bad request" }, { status: 400 });
      return Response.json({ rows: await fetchRebWeekly(start, end) });
    }
    if (sp.get("src") === "kosis") return Response.json({ rows: await fetchKosisPopulation() });
    return Response.json({ error: "bad request" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 502 });
  }
}
