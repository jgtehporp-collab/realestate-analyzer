// 줍줍(보라) / 주목(노랑) 배지 - 분양 목록·지도 공통
export const TAG_TEXT: Record<"zupzup" | "hot", string> = { zupzup: "줍줍", hot: "주목" };

export default function TagBadge({ tag }: { tag: "zupzup" | "hot" }) {
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[10px] font-bold ${tag === "zupzup" ? "bg-violet-600 text-white" : "bg-amber-400 text-amber-950"}`}
    >
      {TAG_TEXT[tag]}
    </span>
  );
}
