import { connection } from "next/server";
import SearchForm from "@/components/SearchForm";
import { connectionStatus } from "@/lib/service";

const ITEMS = [
  { key: "dataGoKr", env: "DATA_GO_KR_KEY", label: "공공데이터포털 (실거래가·K-apt·건축물대장)" },
  { key: "vworld", env: "VWORLD_API_KEY", label: "VWorld (배경지도·좌표)" },
  { key: "kakao", env: "KAKAO_REST_API_KEY", label: "카카오 로컬 (주변 학교·역·편의시설)" },
] as const;

export default async function Home() {
  await connection(); // 환경변수 상태를 요청 시점에 읽도록
  const status = connectionStatus();
  return (
    <>
      <SearchForm />
      <section className="mx-auto max-w-2xl px-4 pb-10">
        <h2 className="text-xs font-bold text-slate-500">데이터 연결 상태</h2>
        <ul className="mt-1 space-y-1 text-xs">
          {ITEMS.map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 rounded-full ${status[i.key] ? "bg-green-500" : "bg-slate-300"}`} />
              <span className={status[i.key] ? "text-slate-700" : "text-slate-400"}>
                {i.label} {status[i.key] ? "연결됨" : `- ${i.env} 미설정`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
