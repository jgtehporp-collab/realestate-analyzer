"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PROVINCES } from "@/lib/regions";

const LAST_KEY = "rea:presale-region";

/** 분양 탭 지역 선택 (시/도 + 구, 구는 "전체" 가능). 선택하면 /presale?province=&lawd= 로 이동 */
export default function RegionPicker({ province, lawd }: { province: string | null; lawd: string | null }) {
  const router = useRouter();
  const [p, setP] = useState(province ?? PROVINCES[0].name);
  const [d, setD] = useState(lawd ?? "");

  useEffect(() => {
    if (province) {
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ province, lawd }));
      } catch {}
      return;
    }
    // 처음 들어오면 마지막으로 본 지역으로 이동
    try {
      const last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
      if (last?.province) router.replace(`/presale?province=${encodeURIComponent(last.province)}${last.lawd ? `&lawd=${last.lawd}` : ""}`);
    } catch {}
  }, [province, lawd, router]);

  const districts = PROVINCES.find((x) => x.name === p)?.districts ?? [];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/presale?province=${encodeURIComponent(p)}${d ? `&lawd=${d}` : ""}`);
      }}
      className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-xl bg-white p-3 shadow-sm"
    >
      <select
        value={p}
        onChange={(e) => {
          setP(e.target.value);
          setD("");
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-base"
      >
        {PROVINCES.map((x) => (
          <option key={x.name} value={x.name}>
            {x.name}
          </option>
        ))}
      </select>
      <select value={d} onChange={(e) => setD(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-base">
        <option value="">전체</option>
        {districts.map((x) => (
          <option key={x.code} value={x.code}>
            {x.name}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-lg bg-navy px-4 text-base font-bold text-white">
        조회
      </button>
    </form>
  );
}
