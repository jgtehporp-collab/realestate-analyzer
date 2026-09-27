import type { PresaleStatus } from "@/lib/presale";

const STYLE: Record<PresaleStatus, string> = {
  접수중: "bg-red-600 text-white",
  청약예정: "bg-accent text-white",
  발표대기: "bg-blue-600 text-white",
  계약: "bg-slate-600 text-white",
  완료: "bg-slate-200 text-slate-600",
};

export default function StatusBadge({ status }: { status: PresaleStatus }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${STYLE[status]}`}>{status}</span>;
}
