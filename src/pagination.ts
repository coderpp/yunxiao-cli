import { CliError } from "./errors.js";
export const pageMetadata = new WeakMap<
  object,
  { next?: number | null; perPage?: number }
>();
export async function paginate(
  fetchPage: (page: number, perPage: number) => Promise<unknown>,
  options: {
    page?: number;
    perPage?: number;
    allPages?: boolean;
    warn?: (s: string) => void;
  } = {},
): Promise<unknown[]> {
  const result: unknown[] = [];
  const seen = new Set<string>();
  const perPage = options.perPage ?? 20;
  let page = options.page ?? 1;
  for (let count = 0; count < 10000; count++) {
    const response = await fetchPage(page, perPage);
    if (!Array.isArray(response))
      throw new CliError(
        "INVALID_RESPONSE",
        "Expected a paginated array response.",
        1,
      );
    const fingerprint = JSON.stringify(response);
    if (response.length && seen.has(fingerprint))
      throw new CliError(
        "REPEATED_PAGE",
        `Server repeated page ${page}; full results unavailable.`,
        6,
      );
    seen.add(fingerprint);
    result.push(...response);
    const meta = pageMetadata.get(response);
    const next =
      meta?.next !== undefined
        ? meta.next
        : response.length >= (meta?.perPage ?? perPage)
          ? page + 1
          : null;
    if (!options.allPages) {
      if (next)
        options.warn?.(
          "More results may exist; use --all-pages for complete results.\n",
        );
      return result;
    }
    if (!next) return result;
    if (next <= page)
      throw new CliError(
        "INVALID_PAGE",
        "Server returned a non-advancing page.",
        6,
      );
    page = next;
  }
  throw new CliError(
    "PAGE_LIMIT",
    "Pagination exceeded 10000 pages; results are incomplete.",
    6,
  );
}
