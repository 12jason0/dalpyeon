"use client";
import { useEffect } from "react";
import { markNewsSeenAction } from "../actions";

/** 새 소식 화면이 실제로 열렸을 때만 읽음 처리한다. 미리 받아 두기로는 지워지지 않는다. */
export function MarkNewsSeen() {
  useEffect(() => {
    void markNewsSeenAction();
  }, []);
  return null;
}
