"use client";

import Link from "next/link";

export default function ReportActions() {
  return (
    <div className="no-print mb-2 flex items-center justify-between">
      <Link href="/" className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold shadow-sm">
        ← 다시 검색
      </Link>
      <button onClick={() => window.print()} className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
        인쇄 / PDF 저장
      </button>
    </div>
  );
}
