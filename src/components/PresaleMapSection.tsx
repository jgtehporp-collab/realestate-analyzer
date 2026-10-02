// 분양 지도 서버 래퍼: 공고 조회·좌표 변환 후 필요한 필드만 클라이언트로 전달
import PresaleMap, { type PresalePin } from "./PresaleMap";
import { getPresaleMap } from "@/lib/presale";
import { vworldKey } from "@/lib/location";

export default async function PresaleMapSection() {
  let data: Awaited<ReturnType<typeof getPresaleMap>> | null = null;
  let error: string | null = null;
  try {
    data = await getPresaleMap();
  } catch (e) {
    error = e instanceof Error ? e.message : "조회 실패";
  }
  if (!data) {
    return <section className="rounded-xl bg-white p-4 text-xs text-red-600 shadow-sm">분양 지도를 불러오지 못했습니다. {error}</section>;
  }
  const pins: PresalePin[] = data.items.map((a) => ({
    key: `${a.kind}:${a.houseManageNo}`,
    no: a.houseManageNo,
    kind: a.kind,
    kindLabel: a.kindLabel,
    name: a.name,
    address: a.address,
    status: a.status,
    group: a.group,
    tag: a.tag,
    reasons: a.reasons,
    households: a.households,
    noticeDate: a.noticeDate,
    receiptStart: a.receiptStart,
    receiptEnd: a.receiptEnd,
    winnerDate: a.winnerDate,
    lat: a.lat,
    lng: a.lng,
    approx: a.approx,
  }));
  return <PresaleMap items={pins} demo={data.demo} missing={data.missing} vworldKey={vworldKey()} />;
}
