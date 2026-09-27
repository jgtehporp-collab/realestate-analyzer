// 단지 1페이지 간략 분석 리포트. 데스크톱/가로 화면은 3단 한 장, 모바일은 세로 스택.
import type { BandReport, ExtraStatus, Report } from "@/lib/analysis";
import type { Grade } from "@/lib/location";
import MapView from "./MapView";
import { formatEok, formatPct, formatYm } from "@/lib/format";
import PriceChart from "./PriceChart";
import ReportActions from "./ReportActions";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="bg-navy px-3 py-1 text-[13px] font-bold text-white">{children}</h3>;
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-sm bg-white shadow-sm ${className}`}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-slate-50 px-3 py-1.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="truncate text-[15px] font-bold">{value}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1 text-xs last:border-0">
      <span className="text-slate-600">{label}</span>
      <span className={strong ? "font-bold" : "font-semibold"}>{value}</span>
    </div>
  );
}

function NoteBox({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col overflow-hidden rounded-sm bg-white shadow-sm">
      <div className="h-3" style={{ background: color }} />
      <div className="px-3 py-2">
        <h4 className="text-sm font-bold">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-slate-700">{children}</p>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<ExtraStatus["state"], string> = {
  ok: "",
  nokey: "API 키 설정 전 - 준비 중",
  notfound: "정보 없음",
  error: "조회 실패",
  demo: "데모 모드 - 실데이터 키 설정 후 표시",
};

function StatusNote({ label, status }: { label: string; status: ExtraStatus }) {
  if (status.state === "ok") return null;
  return (
    <p className="px-3 py-1 text-[10px] text-slate-400" title={status.message}>
      {label}: {STATUS_TEXT[status.state]}
      {status.message && status.state !== "nokey" ? ` (${status.message.slice(0, 60)})` : ""}
    </p>
  );
}

const GRADE_COLOR: Record<Grade["grade"], string> = { S: "text-red-600", A: "text-blue-600", B: "text-slate-500", C: "text-slate-400" };

function GradeTile({ label, grade }: { label: string; grade: Grade | null }) {
  return (
    <div className="bg-slate-50 px-1 py-2 text-center">
      <div className="text-xs text-slate-600">{label}</div>
      {grade ? (
        <>
          <div className={`text-3xl font-black leading-tight ${GRADE_COLOR[grade.grade]}`}>{grade.grade}</div>
          <div className="text-[10px] leading-tight text-slate-500">{grade.reasons.slice(0, 2).join(" · ")}</div>
        </>
      ) : (
        <>
          <div className="text-2xl font-black text-slate-300">—</div>
          <div className="text-[10px] text-slate-400">준비 중</div>
        </>
      )}
    </div>
  );
}

const signedColor = (x: number | null) => (x === null ? "" : x < -0.005 ? "text-blue-600" : x > 0.005 ? "text-red-600" : "");

export default function ReportView({ report, vworldKey }: { report: Report; vworldKey: string | null }) {
  const { complex, bands, activity } = report;
  const latestYm = report.months[report.months.length - 1];
  const mapQuery = encodeURIComponent(`${report.regionName} ${complex.aptNm}`);
  const { kapt, building, location, status } = report.extras;
  const moveIn = kapt?.useDate ? `${kapt.useDate.slice(0, 4)}.${kapt.useDate.slice(4, 6)}` : complex.buildYear ? `${complex.buildYear}년` : null;
  const topFloor = kapt?.topFloor ?? complex.maxFloor;

  return (
    <div className="mx-auto max-w-[1400px] p-2 lg:p-3 print:max-w-none print:p-0">
      <ReportActions />

      {report.demo && (
        <p className="no-print mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          데모 데이터입니다. 서버 환경변수 DATA_GO_KR_KEY(공공데이터포털 실거래가 API 키)를 설정하면 실제 거래로 분석합니다.
        </p>
      )}
      {report.failedMonths.length > 0 && (
        <p className="no-print mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          일부 월 조회 실패로 제외됨: {report.failedMonths.map(formatYm).join(", ")}
        </p>
      )}

      <div className="overflow-hidden rounded-sm shadow">
        {/* 헤더 */}
        <header className="flex flex-wrap items-end justify-between gap-x-4 border-b-4 border-accent bg-navy px-4 py-2 text-white">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{complex.aptNm}</h1>
            <p className="text-xs text-slate-300">{complex.address}</p>
          </div>
          <p className="text-sm text-slate-200">
            {[
              kapt?.households && `${kapt.households.toLocaleString("ko-KR")}세대`,
              moveIn && `입주 ${moveIn}`,
              kapt?.hallType,
              topFloor && `최고 ${topFloor}층`,
              `${formatYm(report.months[0])}~${formatYm(latestYm)} 실거래`,
            ]
              .filter(Boolean)
              .join("  |  ")}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-2 bg-slate-200 p-2 lg:grid-cols-[minmax(250px,26%)_1fr_minmax(250px,26%)]">
          {/* 좌측: 단지 정보 */}
          <div className="order-3 flex flex-col gap-2 lg:order-none">
            <Card title="단지 정보">
              <div className="grid grid-cols-2 gap-px bg-slate-200">
                <Cell label="세대수" value={kapt?.households ? `${kapt.households.toLocaleString("ko-KR")}세대${kapt.dongCount ? ` (${kapt.dongCount}동)` : ""}` : "—"} />
                <Cell label="입주" value={moveIn ? `${moveIn} (${complex.age}년차)` : "—"} />
                <Cell label={kapt?.topFloor ? "최고층" : "최고층 (거래 기준)"} value={topFloor ? `${topFloor}층` : "—"} />
                <Cell
                  label="건폐율 / 용적률"
                  value={building ? `${building.coverageRatio?.toFixed(0) ?? "—"}% / ${building.floorAreaRatio?.toFixed(0) ?? "—"}%` : "—"}
                />
                <Cell label="구조" value={kapt?.hallType ?? "—"} />
                <Cell label="주차 (세대당)" value={kapt?.parkingPerHousehold ? `${kapt.parkingPerHousehold.toFixed(2)}대` : "—"} />
                <Cell label="시공사" value={kapt?.builder ?? "—"} />
                <Cell label="지하철" value={kapt?.subway ? `${kapt.subway}${kapt.subwayWalk ? ` (${kapt.subwayWalk})` : ""}` : "—"} />
                <div className="col-span-2 bg-slate-50 px-3 py-1.5">
                  <div className="text-[11px] text-slate-500">거래된 전용면적(㎡)</div>
                  <div className="text-xs font-semibold">{complex.areas.join(" · ") || "—"}</div>
                </div>
              </div>
              <StatusNote label="K-apt" status={status.kapt} />
              <StatusNote label="건축물대장" status={status.building} />
            </Card>

            <Card title="거래 활성도">
              <Row label="매매 (최근 3개월)" value={`${activity.trades3m}건`} strong />
              <Row label="전세 비중 (전월세 중)" value={formatPct(activity.jeonseShare)} />
              <Row
                label="분석기간 전체 거래"
                value={`매매 ${activity.tradesTotal} / 전세 ${activity.jeonseTotal} / 월세 ${activity.wolseTotal}`}
              />
            </Card>

            <Card title="환경 / 학군 / 공급">
              <div className="grid grid-cols-3 gap-px bg-slate-200">
                <GradeTile label="환경" grade={location?.env ?? null} />
                <GradeTile label="학군" grade={location?.school ?? null} />
                <GradeTile label="공급" grade={null} />
              </div>
              <StatusNote label="주변시설(카카오)" status={status.poi} />
            </Card>

            <Card title="특징 태그">
              <p className="px-3 py-2 text-sm font-semibold leading-relaxed text-accent">{report.tags.join("  ")}</p>
            </Card>

            <Card title="생활권 지도 (반경 1km)" className="flex flex-1 flex-col">
              {location ? (
                <div className="h-[320px] lg:h-auto lg:min-h-[300px] lg:flex-1">
                  <MapView lat={location.lat} lng={location.lng} pois={location.pois} vworldKey={vworldKey} title={complex.aptNm} />
                </div>
              ) : (
                <StatusNote label="지도" status={status.map} />
              )}
              <div className="no-print flex gap-2 px-3 py-2">
                <a
                  href={`https://map.naver.com/p/search/${mapQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded bg-green-600 py-1.5 text-center text-xs font-bold text-white"
                >
                  네이버 지도
                </a>
                <a
                  href={`https://map.kakao.com/?q=${mapQuery}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded bg-yellow-400 py-1.5 text-center text-xs font-bold text-slate-900"
                >
                  카카오맵
                </a>
              </div>
            </Card>
          </div>

          {/* 가운데: 차트 + 시나리오 */}
          <div className="order-1 flex flex-col gap-2 lg:order-none">
            {bands.length === 0 && (
              <div className="rounded-sm bg-white p-6 text-center text-sm text-slate-500">분석기간 내 매매 거래가 없습니다.</div>
            )}
            {bands.map((b) => (
              <section key={b.band} className="rounded-sm bg-slate-50 px-2 pt-2 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
                  <h2 className="text-base font-bold">
                    {b.label} <span className="text-sm font-semibold text-slate-500">(전용 {b.mainArea}㎡)</span> 매매·전세 실거래
                  </h2>
                  <div className="flex gap-3 text-[11px] text-slate-600">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-0.5 w-4 bg-red-600" /> 매매 (월평균)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-4 border-t-2 border-dashed border-blue-600" /> 전세 (월평균)
                    </span>
                  </div>
                </div>
                <div className="aspect-[600/290] w-full">
                  <PriceChart band={b} />
                </div>
              </section>
            ))}
            {report.otherBands.length > 0 && (
              <p className="px-1 text-[11px] text-slate-500">
                기타 평형: {report.otherBands.map((o) => `${o.label} ${o.tradeCount}건`).join(", ")}
              </p>
            )}
            {bands.length > 0 && <ScenarioTable bands={bands} />}
          </div>

          {/* 우측: 핵심 수치 + 코멘트 */}
          <div className="order-2 flex flex-col gap-2 lg:order-none">
            <Card title="핵심 수치">
              {bands.map((b) => (
                <div key={b.band}>
                  <div className="bg-indigo-50 px-3 py-0.5 text-xs font-bold">{b.label}</div>
                  <Row label="현재가" value={b.current ? `${formatEok(b.current.value)} (${formatYm(b.current.ym)})` : "—"} strong />
                  <Row label="전고점" value={b.peak ? `${formatEok(b.peak.value)} (${formatYm(b.peak.ym)})` : "—"} />
                  <Row label="전세가율" value={formatPct(b.jeonseRatio)} />
                  <Row label="투자금(갭)" value={formatEok(b.gap)} strong />
                  <Row
                    label="기회구간 (전고점 대비)"
                    value={<span className={signedColor(b.fromPeak)}>{formatPct(b.fromPeak, 1, true)}</span>}
                  />
                </div>
              ))}
            </Card>
            <NoteBox title="가치" color="#f97316">
              {report.notes.value}
            </NoteBox>
            <NoteBox title="가격" color="#dc2626">
              {report.notes.price}
            </NoteBox>
            <NoteBox title="투자생각" color="#2563eb">
              {report.notes.invest}
            </NoteBox>
            <p className="mt-auto px-1 text-[10px] text-slate-500">
              분석기준: {formatYm(latestYm)} 실거래 (국토교통부) · 해제거래 제외 · 월평균(대표면적 환산) · 전세는 최근 3개월 평균
              {report.demo && " · 데모 데이터"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioTable({ bands }: { bands: BandReport[] }) {
  const rows: { label: string; get: (b: BandReport) => React.ReactNode }[] = [
    { label: "현재 매매가", get: (b) => formatEok(b.current?.value) },
    { label: "전고점", get: (b) => formatEok(b.peak?.value) },
    { label: "전세가 (최근 3개월)", get: (b) => formatEok(b.jeonse) },
    { label: "투자금(갭)", get: (b) => formatEok(b.gap) },
    { label: "전세가율", get: (b) => formatPct(b.jeonseRatio) },
    { label: "하락점 낙폭", get: (b) => formatPct(b.troughDrop, 1, true) },
    { label: "전고점 회복 시 차익", get: (b) => formatEok(b.recoveryGain) },
    { label: "투자금 대비 수익률", get: (b) => formatPct(b.recoveryRoi, 0) },
  ];
  return (
    <section className="overflow-x-auto rounded-sm bg-white shadow-sm">
      <SectionTitle>시나리오 분석 (전고점 회복 가정)</SectionTitle>
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="bg-navy px-2 py-1 text-white" />
            {bands.map((b) => (
              <th key={b.band} className="border border-slate-200 bg-slate-100 px-2 py-1">
                {b.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th className="whitespace-nowrap bg-navy px-2 py-1 font-semibold text-white">{r.label}</th>
              {bands.map((b) => (
                <td key={b.band} className="border border-slate-200 px-2 py-1 font-semibold">
                  {r.get(b)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
