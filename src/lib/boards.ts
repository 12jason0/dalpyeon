import type { Board } from "./db/schema";

/** 남친톡 말머리. 화면(클라이언트)과 서비스가 같이 쓴다. */
export const BOARDS: Record<Board, string> = { question: "고민", tip: "꿀팁", review: "후기" };

/** 남친톡 글 본문 최대 글자 수. 글쓰기 화면의 "0/1000"과 서버 검증이 같이 쓴다. */
export const POST_BODY_MAX = 1000;

export const isBoard = (value: unknown): value is Board => typeof value === "string" && Object.hasOwn(BOARDS, value);
