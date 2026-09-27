export default function Loading() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-accent" />
      <p className="mt-4 text-sm font-semibold">청약홈 분양 정보를 불러오는 중…</p>
    </div>
  );
}
