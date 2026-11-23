// 신규 분양 텔레그램 알림(GitHub Actions)용 청약홈 공고 프록시. HOT_BUILD_SECRET 인증.
// 공공데이터포털이 해외망(GitHub 러너)을 막는 경우가 있어 서울 리전(icn1)의 이 함수를 거쳐 조회.
import type { NextRequest } from "next/server";
import { isAnnKind } from "@/lib/applyhome";
import { getPresaleDetail, getPresaleFeed, marginSummary } from "@/lib/presale";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.HOT_BUILD_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    // ?margin=<kind>:<공고번호> → 알림 메시지용 안전마진 요약 (줍줍은 같은 단지 실거래 기준)
    const margin = request.nextUrl.searchParams.get("margin");
    if (margin) {
      const [kind, no] = margin.split(":");
      if (!isAnnKind(kind) || !no) return Response.json({ error: "bad request" }, { status: 400 });
      const detail = await getPresaleDetail(no, kind);
      return Response.json({ margin: detail ? marginSummary(detail.models) : null });
    }
    return Response.json(await getPresaleFeed());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "조회 실패" }, { status: 502 });
  }
}
