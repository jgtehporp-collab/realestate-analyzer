export default function PresalePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-bold">분양</h1>
      <p className="mt-2 text-sm text-slate-600">준비 중입니다. 매매 분석을 먼저 완성한 뒤 아래 기능을 추가할 예정입니다.</p>
      <ul className="mt-6 space-y-2 rounded-lg bg-white p-5 text-sm shadow-sm">
        <li>• 청약홈 분양정보 API 연동: 지역별 분양 예정·진행 단지 목록</li>
        <li>• 분양가 vs 인근 신축 실거래가 비교 (안전마진)</li>
        <li>• 청약 경쟁률·당첨 가점 이력</li>
        <li>• 3년 내 입주 예정 물량(공급) 체크</li>
      </ul>
    </div>
  );
}
