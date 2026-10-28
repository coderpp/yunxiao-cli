export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 2,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export function redact(text: string, secrets: string[] = []): string {
  for (const secret of secrets)
    if (secret) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/pt-[\w.-]+/g, "[REDACTED]")
    .replace(/https?:\/\/[^\s"<>]+\?[^\s"<>]+/g, "[URL query redacted]");
}
export function errorInfo(error: unknown): {
  code: string;
  message: string;
  exitCode: number;
  details?: unknown;
  requestId?: string;
} {
  if (error instanceof CliError) return error;
  const e = error as {
    message?: string;
    status?: number;
    requestId?: string;
    apiCode?: string;
  };
  const status = e?.status;
  const exitCode =
    status === 401 || status === 403
      ? 3
      : status === 404
        ? 4
        : status === 409 || status === 412
          ? 5
          : status === 429 || (status ?? 0) >= 500
            ? 6
            : status && status >= 400
              ? 2
              : 1;
  return {
    code: e?.apiCode ?? (status ? `HTTP_${status}` : "ERROR"),
    message: e?.message ?? String(error),
    exitCode,
    requestId: e?.requestId,
  };
}
