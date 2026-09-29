"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Complex } from "@/lib/analysis";
import { PROVINCES, regionLabel } from "@/lib/regions";
import { formatEok, formatYm } from "@/lib/format";
import { clearRecent, loadRecent, removeRecent, type Recent } from "@/lib/recent";

const LAST_KEY = "rea:last";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 사파리 개인정보 보호 모드 등에서는 저장 실패 - 무시
  }
}

export default function SearchForm() {
  const router = useRouter();
  const [province, setProvince] = useState(PROVINCES[0].name);
  const [lawd, setLawd] = useState(PROVINCES[0].districts[0].code);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Complex[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    const last = load<{ province: string; lawd: string } | null>(LAST_KEY, null);
    const p = last && PROVINCES.find((x) => x.name === last.province);
    // localStorage는 클라이언트에서만 읽을 수 있어 마운트 후 반영
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p && p.districts.some((d) => d.code === last.lawd)) {
      setProvince(p.name);
      setLawd(last.lawd);
    }
    setRecent(loadRecent());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const districts = PROVINCES.find((p) => p.name === province)?.districts ?? [];

  function openReport(c: { id: string; aptNm: string }, code = lawd) {
    // 최근 본 단지 기록은 리포트 페이지(RecordRecent)에서 처리
    router.push(`/report?lawd=${code}&id=${encodeURIComponent(c.id)}`);
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    save(LAST_KEY, { province, lawd });
    try {
      const res = await fetch(`/api/complexes?lawd=${lawd}&q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "조회 실패");
      setDemo(data.demo);
      const list: Complex[] = data.complexes;
      if (list.length === 1 && query.trim()) {
        openReport(list[0]);
        return;
      }
      setResults(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-bold">매매 · 단지 분석</h1>
      <p className="mt-1 text-sm text-slate-600">
        구를 선택하고 아파트명을 입력하면 국토부 실거래가로 1페이지 분석 자료를 만듭니다.
      </p>

      <form onSubmit={onSearch} className="mt-5 space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">시/도</span>
            <select
              value={province}
              onChange={(e) => {
                setProvince(e.target.value);
                setLawd(PROVINCES.find((p) => p.name === e.target.value)!.districts[0].code);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            >
              {PROVINCES.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">구</span>
            <select
              value={lawd}
              onChange={(e) => setLawd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base"
            >
              {districts.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">아파트명 (비우면 거래 많은 단지 목록)</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 아이파크, 래미안"
            enterKeyHint="search"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-navy py-3 text-base font-bold text-white disabled:opacity-60"
        >
          {loading ? "실거래 자료 조회 중…" : "단지 찾기"}
        </button>
      </form>

      {demo && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          데모 모드: 서버에 DATA_GO_KR_KEY가 설정되지 않아 가상 데이터를 보여줍니다.
        </p>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {results && (
        <section className="mt-5">
          <h2 className="text-sm font-bold text-slate-700">
            {regionLabel(lawd)} 검색 결과 {results.length}건 <span className="font-normal text-slate-500">(최근 12개월 매매 기준)</span>
          </h2>
          {results.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">일치하는 단지가 없습니다. 단지명 일부만 입력해 보세요.</p>
          )}
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm">
            {results.map((c) => (
              <li key={c.id}>
                <button onClick={() => openReport(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50">
                  <div>
                    <div className="font-semibold">{c.aptNm}</div>
                    <div className="text-xs text-slate-500">
                      {c.umdNm} {c.jibun} · {c.buildYear ? `${c.buildYear}년 입주` : "입주년도 미상"} · 매매 {c.tradeCount}건
                    </div>
                  </div>
                  {c.lastPrice && c.lastYm && (
                    <div className="shrink-0 text-right text-xs text-slate-500">
                      <div className="font-semibold text-slate-800">{formatEok(c.lastPrice)}</div>
                      {formatYm(c.lastYm)}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!results && recent.length > 0 && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-slate-700">
              최근 본 단지 <span className="font-normal text-slate-400">{recent.length}</span>
            </h2>
            <button onClick={() => setRecent(clearRecent())} className="text-xs text-slate-400">
              전체 지우기
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {recent.map((r) => (
              <span key={r.id} className="flex items-center rounded-full bg-white text-sm shadow-sm">
                <button onClick={() => openReport({ id: r.id, aptNm: r.name }, r.lawd)} className="py-1.5 pl-3 pr-1">
                  {r.name} <span className="text-xs text-slate-400">{regionLabel(r.lawd).split(" ").slice(1).join(" ")}</span>
                </button>
                <button
                  onClick={() => setRecent(removeRecent(r.id))}
                  aria-label={`${r.name} 삭제`}
                  className="px-2 py-1.5 text-slate-300"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
