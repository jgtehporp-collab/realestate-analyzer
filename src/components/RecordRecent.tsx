"use client";

import { useEffect } from "react";
import { addRecent } from "@/lib/recent";

/** 리포트가 열리면 최근 본 단지에 기록 (검색·급등락 목록·직접 링크 모두) */
export default function RecordRecent({ lawd, id, name }: { lawd: string; id: string; name: string }) {
  useEffect(() => {
    addRecent({ lawd, id, name });
  }, [lawd, id, name]);
  return null;
}
