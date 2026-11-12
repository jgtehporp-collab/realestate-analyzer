// 신규 분양 공고 텔레그램 알림 (GitHub Actions에서 하루 3번 실행)
// 서울·경기·인천 청약예정·접수중 공고 중 처음 보는 것만 보내고, 보낸 목록은 src/data/presale-seen.json에 기록.
//
// 필요한 시크릿: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID(쉼표로 여러 개), HOT_SOURCE_URL(앱 주소), HOT_BUILD_SECRET
// TELEGRAM_CHAT_ID 없이 실행하면 봇에게 온 최근 메시지의 채팅 ID를 로그에 출력 (처음 설정용).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PresaleFeedItem } from "../src/lib/presale";

const SEEN_FILE = process.env.PRESALE_SEEN_FILE || join(process.cwd(), "src/data/presale-seen.json");
const KEEP_DAYS = 200; // 이보다 오래 전에 본 공고는 기록에서 정리
const MAX_PER_RUN = 15; // 한 번에 보내는 개별 알림 최대 수 (나머지는 묶어서 한 줄씩)

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const APP = process.env.HOT_SOURCE_URL?.trim().replace(/\/+$/, "");
const SECRET = process.env.HOT_BUILD_SECRET?.trim();
const DRY_RUN = !!process.env.DRY_RUN; // 보내지 않고 메시지만 출력 (기록 파일도 그대로)

type SeenFile = { initializedAt: string | null; seen: Record<string, string> };

const kstDate = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const md = (d: string) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : "");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
const eok = (manwon: number) => `${(manwon / 10000).toFixed(manwon >= 100000 ? 1 : 2).replace(/\.?0+$/, "")}억`;
const appLink = (x: PresaleFeedItem) => (APP ? `${APP}/presale/${x.no}${x.kind === "apt" ? "" : `?kind=${x.kind}`}` : null);

async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown; parameters?: { retry_after?: number } };
  if (!data.ok) {
    // 초당 전송 한도: 안내된 시간만큼 쉬고 한 번 더
    if (res.status === 429 && data.parameters?.retry_after) {
      await new Promise((r) => setTimeout(r, (data.parameters!.retry_after! + 1) * 1000));
      return telegram(method, body);
    }
    throw new Error(`텔레그램 ${method} 실패: ${data.description ?? res.status}`);
  }
  return data.result;
}

async function send(html: string) {
  if (DRY_RUN) {
    console.log(`--- (DRY_RUN) 전송할 메시지 ---\n${html}\n`);
    return;
  }
  for (const chat_id of CHAT_IDS) {
    await telegram("sendMessage", { chat_id, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    await new Promise((r) => setTimeout(r, 400));
  }
}

function message(x: PresaleFeedItem): string {
  const head = x.tag === "zupzup" ? "🟣 줍줍" : x.tag === "hot" ? "🟡 주목" : "🆕 신규";
  const tier = x.price && x.price.amount >= 150000 ? " 💎15억↑" : x.price && x.price.amount >= 90000 ? " 🔷9억↑" : "";
  const region = x.address.split(/\s+/).slice(0, 3).join(" ");
  const receipt = x.receiptStart ? `${md(x.receiptStart)}${x.receiptEnd && x.receiptEnd !== x.receiptStart ? `~${md(x.receiptEnd)}` : ""}` : "미정";
  const lines = [
    `<b>${head} 분양 공고${tier}</b> (${esc(x.status)})`,
    `<b>${esc(x.name)}</b>`,
    `📍 ${esc(region)} · ${x.households.toLocaleString("ko-KR")}세대${x.kind === "apt" ? "" : ` · ${esc(x.kindLabel)}`}`,
  ];
  if (x.price) lines.push(`💰 대표 분양가 ${eok(x.price.amount)} (전용 ${x.price.area}㎡ 최고가)`);
  lines.push(
    `📅 공고 ${md(x.noticeDate) || "—"}${x.specialStart ? ` · 특공 ${md(x.specialStart)}` : ""} · 접수 ${receipt}${x.winnerDate ? ` · 발표 ${md(x.winnerDate)}` : ""}`,
  );
  const reasons = x.reasons.filter((r) => r !== "일반분양");
  if (reasons.length) lines.push(`🏷 ${esc(reasons.join(" · "))}`);
  const links = [appLink(x) && `<a href="${esc(appLink(x)!)}">앱에서 분석 보기</a>`, x.url && `<a href="${esc(x.url)}">청약홈 공고</a>`].filter(Boolean);
  if (links.length) lines.push(`🔗 ${links.join(" | ")}`);
  return lines.join("\n");
}

async function fetchFeed(): Promise<PresaleFeedItem[]> {
  if (APP && SECRET) {
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(`${APP}/api/internal/presales`, { headers: { authorization: `Bearer ${SECRET}` }, signal: AbortSignal.timeout(90_000) });
        const body = (await res.json()) as { demo?: boolean; items?: PresaleFeedItem[]; error?: string };
        if (!res.ok) throw new Error(`프록시 HTTP ${res.status}: ${body.error ?? ""}`);
        if (body.demo) throw new Error("앱이 데모 모드입니다 (Vercel에 DATA_GO_KR_KEY 확인)");
        return body.items ?? [];
      } catch (e) {
        if (attempt >= 3 || (e instanceof Error && /HTTP 401|데모/.test(e.message))) throw e;
        await new Promise((r) => setTimeout(r, 5000 * attempt));
      }
    }
  }
  // 프록시 없이 직접 (로컬 실행: DATA_GO_KR_KEY 필요, --conditions=react-server)
  const { getPresaleFeed } = await import("../src/lib/presale");
  return (await getPresaleFeed()).items;
}

/** 처음 설정용: 봇에게 메시지를 보낸 채팅의 ID 출력 */
async function printChatIds() {
  const updates = (await telegram("getUpdates", {})) as { message?: { chat: { id: number; type: string; title?: string; first_name?: string } } }[];
  const chats = new Map<number, string>();
  for (const u of updates) if (u.message) chats.set(u.message.chat.id, `${u.message.chat.type} ${u.message.chat.title ?? u.message.chat.first_name ?? ""}`);
  if (!chats.size) {
    console.log("봇에게 온 메시지가 없습니다. 텔레그램에서 봇에게 아무 메시지나 보낸 뒤 다시 실행하세요.");
    return;
  }
  console.log("TELEGRAM_CHAT_ID 후보 (GitHub Secrets에 등록, 여러 개면 쉼표로 구분):");
  for (const [id, label] of chats) console.log(`  ${id}  (${label})`);
}

async function main() {
  if (!TOKEN && !DRY_RUN) {
    console.log("TELEGRAM_BOT_TOKEN이 없어 건너뜀");
    return;
  }
  if (!CHAT_IDS.length && !DRY_RUN) {
    await printChatIds();
    return;
  }

  let file: SeenFile = { initializedAt: null, seen: {} };
  try {
    file = JSON.parse(readFileSync(SEEN_FILE, "utf8")) as SeenFile;
  } catch {
    // 없음 → 첫 실행
  }
  const today = kstDate();
  const items = await fetchFeed();
  console.log(`청약예정·접수중 공고 ${items.length}건`);

  if (!file.initializedAt) {
    // 첫 실행: 지금 있는 공고는 알림 없이 기록만 하고 시작 안내 1건
    for (const x of items) file.seen[x.key] = today;
    file.initializedAt = today;
    await send(
      `<b>🔔 신규 분양 알림을 시작합니다</b>\n서울·경기·인천 청약예정·접수중 ${items.length}건은 이미 확인된 것으로 두고, 이후 새로 올라오는 공고만 보내드려요.` +
        (APP ? `\n🔗 <a href="${esc(APP)}/presale">분양 지도 보기</a>` : ""),
    );
    console.log("첫 실행: 기존 공고 기록, 시작 안내 전송");
  } else {
    const fresh = items
      .filter((x) => !file.seen[x.key])
      .sort((a, b) => (a.tag === b.tag ? 0 : a.tag === "zupzup" ? -1 : b.tag === "zupzup" ? 1 : a.tag === "hot" ? -1 : 1));
    console.log(`신규 ${fresh.length}건`);
    for (const x of fresh.slice(0, MAX_PER_RUN)) {
      await send(message(x));
      file.seen[x.key] = today; // 보낸 것만 기록 (중간 실패 시 다음 실행에서 다시 시도)
      console.log(`  전송: ${x.name}`);
    }
    const rest = fresh.slice(MAX_PER_RUN);
    if (rest.length) {
      await send(
        `<b>🆕 그 밖의 신규 공고 ${rest.length}건</b>\n` +
          rest.map((x) => `· ${esc(x.name)} (${esc(x.address.split(/\s+/).slice(0, 2).join(" "))})`).join("\n") +
          (APP ? `\n🔗 <a href="${esc(APP)}/presale">분양 지도 보기</a>` : ""),
      );
      for (const x of rest) file.seen[x.key] = today;
    }
  }

  const cutoff = kstDate(new Date(Date.now() - KEEP_DAYS * 86400e3));
  for (const [k, d] of Object.entries(file.seen)) if (d < cutoff) delete file.seen[k];
  if (!DRY_RUN) writeFileSync(SEEN_FILE, JSON.stringify(file, null, 1) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
