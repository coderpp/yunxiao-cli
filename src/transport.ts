import { CliError, redact } from "./errors.js";
import { pageMetadata } from "./pagination.js";
import type { Fetcher } from "./client.js";
export class YunxiaoApiError extends Error {
  readonly apiCode?: string;
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
    readonly method: string,
    readonly url: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "YunxiaoApiError";
    try {
      const body = JSON.parse(responseBody);
      this.apiCode = body.code ?? body.errorCode;
    } catch {}
  }
}
export async function requestJson(
  fetcher: Fetcher,
  url: URL,
  init: RequestInit,
  options: {
    timeoutMs: number;
    retries: number;
    token: string;
    readOnly: boolean;
  },
): Promise<unknown> {
  const method = init.method ?? "GET";
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryAfter = 0;
    try {
      const operation = (async () => {
        const response = await fetcher(url.toString(), {
          ...init,
          signal: controller.signal,
          redirect: "error",
        });
        const body = await response.text();
        const raw = response.headers.get("retry-after");
        if (raw)
          retryAfter = /^\d+(\.\d+)?$/.test(raw)
            ? Number(raw) * 1000
            : Math.max(0, Date.parse(raw) - Date.now());
        if (!Number.isFinite(retryAfter)) retryAfter = 0;
        if (!response.ok) {
          const safe = redact(body, [options.token]);
          throw new YunxiaoApiError(
            `Yunxiao API request failed with HTTP ${response.status}: ${method} ${url.origin}${url.pathname}${safe ? "\n" + safe : ""}`,
            response.status,
            safe,
            method,
            url.origin + url.pathname,
            response.headers.get("x-request-id") ?? undefined,
          );
        }
        if (!body) return null;
        let value: unknown;
        try {
          value = JSON.parse(body);
        } catch {
          throw new CliError(
            "INVALID_RESPONSE",
            "API returned invalid JSON.",
            options.readOnly ? 1 : 7,
          );
        }
        if (
          value === false ||
          (value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            ((value as Record<string, unknown>).success === false ||
              (value as Record<string, unknown>).result === false))
        )
          throw new CliError(
            "API_REJECTED",
            "API reported an unsuccessful operation.",
            5,
          );
        if (Array.isArray(value)) {
          const next = response.headers.get("x-next-page");
          const per = response.headers.get("x-per-page");
          if (
            next !== null &&
            next !== "" &&
            (!/^\d+$/.test(next) || Number(next) < 1)
          )
            throw new CliError(
              "INVALID_RESPONSE",
              "Invalid pagination response header.",
              1,
            );
          pageMetadata.set(value, {
            next: next === null ? undefined : next === "" ? null : Number(next),
            perPage: per && Number(per) > 0 ? Number(per) : undefined,
          });
        }
        return value;
      })();
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new CliError(
                options.readOnly ? "TIMEOUT" : "WRITE_RESULT_UNKNOWN",
                "Request timed out; " +
                  (options.readOnly
                    ? "read can be retried."
                    : "verify server state before retrying."),
                options.readOnly ? 6 : 7,
              ),
            );
          }, options.timeoutMs);
        }),
      ]);
    } catch (error) {
      const transient =
        error instanceof YunxiaoApiError
          ? [429, 502, 503, 504].includes(error.status)
          : !(error instanceof CliError) || error.code === "TIMEOUT";
      if (
        !options.readOnly &&
        error instanceof YunxiaoApiError &&
        error.status >= 500
      )
        throw new CliError(
          "WRITE_RESULT_UNKNOWN",
          "Server error during write; verify server state before retrying.",
          7,
          { requestId: error.requestId, status: error.status },
        );
      if (
        !options.readOnly &&
        !(error instanceof YunxiaoApiError) &&
        !(error instanceof CliError)
      )
        throw new CliError(
          "WRITE_RESULT_UNKNOWN",
          "Network error; verify server state before retrying this write.",
          7,
        );
      if (!options.readOnly || !transient || attempt >= options.retries) {
        if (!(error instanceof YunxiaoApiError) && !(error instanceof CliError))
          throw new CliError("NETWORK_ERROR", "Network request failed.", 6);
        throw error;
      }
      if (retryAfter > 60000)
        throw new CliError(
          "RATE_LIMITED",
          "Server requests a retry delay longer than 60 seconds; retry later.",
          6,
        );
    } finally {
      if (timer) clearTimeout(timer);
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(
          retryAfter,
          Math.min(500 * 2 ** attempt, 5000) + Math.random() * 100,
        ),
      ),
    );
  }
}
