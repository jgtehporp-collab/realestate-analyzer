export default function Loading() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-accent" />
      <p className="mt-4 text-sm font-semibold">최근 24개월 매매·전월세 실거래를 모으는 중…</p>
      <p className="mt-1 text-xs text-slate-500">구 단위 첫 조회는 20~40초 걸릴 수 있고, 이후에는 캐시로 빨라집니다.</p>
    </div>
  );
}
