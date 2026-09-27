"use client";

import Link from "next/link";
import type { ReportPeriod } from "@/lib/analysis";

const OPTIONS = [
  { mode: "auto", label: "자동" },
  { mode: "24", label: "24개월" },
  { mode: "36", label: "36개월" },
] as const;

export default function ReportActions({ lawd, id, period }: { lawd: string; id: string; period: ReportPeriod }) {
  return (
    <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-2">
      <Link href="/" className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold shadow-sm">
        ← 다시 검색
      </Link>
      <div className="flex items-center gap-2">
        <div className="flex overflow-hidden rounded-md bg-white text-sm shadow-sm">
          {OPTIONS.map((o) => (
            <Link
              key={o.mode}
              href={`/report?lawd=${lawd}&id=${encodeURIComponent(id)}${o.mode === "auto" ? "" : `&period=${o.mode}`}`}
              className={`px-3 py-1.5 font-semibold ${period.mode === o.mode ? "bg-accent text-white" : "text-slate-600"}`}
            >
              {o.label}
            </Link>
          ))}
        </div>
        <button onClick={() => window.print()} className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
          인쇄 / PDF
        </button>
      </div>
    </div>
  );
}
