// "최근 본 단지" (브라우저 localStorage). 리포트 페이지가 열릴 때마다 기록.
export type Recent = { lawd: string; id: string; name: string };

export const RECENT_KEY = "rea:recent";
export const RECENT_MAX = 12;

export function loadRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as Recent[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: Recent[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // 사파리 개인정보 보호 모드 등에서는 저장 실패 - 무시
  }
}

/** 맨 앞에 추가(중복 제거) 후 최대 개수로 자름 */
export function addRecent(item: Recent): Recent[] {
  const next = [item, ...loadRecent().filter((r) => r.id !== item.id)].slice(0, RECENT_MAX);
  saveRecent(next);
  return next;
}

export function removeRecent(id: string): Recent[] {
  const next = loadRecent().filter((r) => r.id !== id);
  saveRecent(next);
  return next;
}

export function clearRecent(): Recent[] {
  saveRecent([]);
  return [];
}
