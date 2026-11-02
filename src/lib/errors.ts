/** 화면에 그대로 보여줘도 되는 오류. 그 외 오류는 일반 메시지로 바꿔 보여준다. */
export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AppError";
  }
}

export function fail(message: string, status = 400): never {
  throw new AppError(message, status);
}

/** 로그에 남기는 오류 종류. DB 오류의 message에는 쿼리 입력값이 들어 있어 쓰지 않는다. */
export function errorKind(e: unknown) {
  if (!(e instanceof Error)) return "unknown";
  const code = (e.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" ? `${e.name} ${code}` : e.name;
}
