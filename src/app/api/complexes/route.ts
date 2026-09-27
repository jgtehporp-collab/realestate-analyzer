import type { NextRequest } from "next/server";
import { findComplexes } from "@/lib/service";

export async function GET(request: NextRequest) {
  const lawd = request.nextUrl.searchParams.get("lawd") ?? "";
  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    return Response.json(await findComplexes(lawd, q));
  } catch (e) {
    const message = e instanceof Error ? e.message : "조회 실패";
    return Response.json({ error: message }, { status: 502 });
  }
}
