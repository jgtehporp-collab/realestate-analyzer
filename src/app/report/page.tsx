import type { Metadata } from "next";
import Link from "next/link";
import ReportView from "@/components/ReportView";
import type { PeriodMode } from "@/lib/analysis";
import { getReport } from "@/lib/service";
import { vworldKey } from "@/lib/location";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// 36개월 첫 조회(전월세 포함)는 수십 초 걸릴 수 있음
export const maxDuration = 120;

export const metadata: Metadata = { title: "단지 분석 | 부동산 분석" };

export default async function ReportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const lawd = one(sp.lawd);
  const id = one(sp.id);
  const p = one(sp.period);
  const mode: PeriodMode = p === "24" || p === "36" ? p : "auto";

  let report;
  let error: string | null = null;
  try {
    report = lawd && id ? await getReport(lawd, id, mode) : null;
  } catch (e) {
    error = e instanceof Error ? e.message : "분석 실패";
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 text-center">
        <p className="text-sm text-slate-600">{error ?? "해당 단지의 거래 내역을 찾지 못했습니다."}</p>
        <Link href="/" className="mt-4 inline-block rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white">
          다시 검색
        </Link>
      </div>
    );
  }
  return <ReportView report={report} vworldKey={vworldKey()} requestId={id} />;
}
