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
