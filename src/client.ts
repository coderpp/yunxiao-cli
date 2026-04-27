export type YunxiaoEdition = "center" | "region";

export type Fetcher = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface YunxiaoClientOptions {
  token: string;
  domain?: string;
  organizationId?: string;
  edition?: YunxiaoEdition;
  fetcher?: Fetcher;
}

export interface ListChangeRequestsOptions {
  page?: number;
  perPage?: number;
  projectIds?: string;
  authorIds?: string;
  reviewerIds?: string;
  state?: "opened" | "merged" | "closed" | string;
  search?: string;
  orderBy?: "created_at" | "updated_at" | string;
  sort?: "asc" | "desc" | string;
  createdBefore?: string;
  createdAfter?: string;
}

export interface ReviewChangeRequestOptions {
  reviewComment?: string;
  reviewOpinion?: "PASS" | "NOT_PASS";
  submitDraftCommentIds?: string[];
}

export interface MergeChangeRequestOptions {
  mergeMessage?: string;
  mergeType?: "ff-only" | "no-fast-forward" | "squash" | "rebase";
  removeSourceBranch?: boolean;
}

export interface ChangeRequestTreeOptions {
  fromPatchSetId: string;
  toPatchSetId: string;
}

export interface ApproveAndMergeOptions extends ReviewChangeRequestOptions, MergeChangeRequestOptions {}

export class YunxiaoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = "YunxiaoApiError";
  }
}

export class YunxiaoClient {
  private readonly token: string;
  private readonly domain: string;
  private readonly organizationId?: string;
  private readonly edition: YunxiaoEdition;
  private readonly fetcher: Fetcher;

  constructor(options: YunxiaoClientOptions) {
    if (!options.token) {
      throw new Error("Yunxiao token is required. Set YUNXIAO_TOKEN or pass --token.");
    }

    this.token = options.token;
    this.domain = stripProtocol(options.domain ?? "openapi-rdc.aliyuncs.com");
    this.organizationId = options.organizationId;
    this.edition = options.edition ?? (options.organizationId ? "center" : "region");
    this.fetcher = options.fetcher ?? fetch;

    if (this.edition === "center" && !this.organizationId) {
      throw new Error("Center edition requires organizationId. Set YUNXIAO_ORGANIZATION_ID or pass --organization-id.");
    }
  }

  listChangeRequests(options: ListChangeRequestsOptions = {}): Promise<unknown> {
    return this.request("GET", this.changeRequestsPath(), options);
  }

  reviewChangeRequest(
    repositoryId: string,
    localId: number,
    options: ReviewChangeRequestOptions = {}
  ): Promise<unknown> {
    return this.request("POST", `${this.repositoryChangeRequestPath(repositoryId, localId)}/review`, undefined, {
      ...compactBody({
        reviewComment: options.reviewComment,
        submitDraftCommentIds: options.submitDraftCommentIds
      }),
      reviewOpinion: options.reviewOpinion ?? "PASS"
    });
  }

  mergeChangeRequest(
    repositoryId: string,
    localId: number,
    options: MergeChangeRequestOptions = {}
  ): Promise<unknown> {
    return this.request("POST", `${this.repositoryChangeRequestPath(repositoryId, localId)}/merge`, undefined, {
      ...compactBody({
        mergeMessage: options.mergeMessage,
        removeSourceBranch: options.removeSourceBranch
      }),
      mergeType: options.mergeType ?? "no-fast-forward"
    });
  }

  async approveAndMerge(repositoryId: string, localId: number, options: ApproveAndMergeOptions = {}): Promise<unknown> {
    await this.reviewChangeRequest(repositoryId, localId, {
      reviewComment: options.reviewComment,
      reviewOpinion: options.reviewOpinion ?? "PASS",
      submitDraftCommentIds: options.submitDraftCommentIds
    });

    return this.mergeChangeRequest(repositoryId, localId, {
      mergeMessage: options.mergeMessage,
      mergeType: options.mergeType,
      removeSourceBranch: options.removeSourceBranch
    });
  }

  getChangeRequestTree(repositoryId: string, localId: number, options: ChangeRequestTreeOptions): Promise<unknown> {
    return this.request("GET", `${this.repositoryChangeRequestPath(repositoryId, localId)}/diffs/changeTree`, options);
  }

  listChangeRequestPatchSets(repositoryId: string, localId: number): Promise<unknown> {
    return this.request("GET", `${this.repositoryChangeRequestPath(repositoryId, localId)}/diffs/patches`);
  }

  private changeRequestsPath(): string {
    if (this.edition === "center") {
      return `/oapi/v1/codeup/organizations/${encodePathSegment(this.organizationId ?? "")}/changeRequests`;
    }

    return "/oapi/v1/codeup/changeRequests";
  }

  private repositoryChangeRequestPath(repositoryId: string, localId: number): string {
    const encodedRepositoryId = encodePathSegment(repositoryId);
    if (this.edition === "center") {
      return `/oapi/v1/codeup/organizations/${encodePathSegment(this.organizationId ?? "")}/repositories/${encodedRepositoryId}/changeRequests/${localId}`;
    }

    return `/oapi/v1/codeup/repositories/${encodedRepositoryId}/changeRequests/${localId}`;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    query?: object,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    const url = new URL(`https://${this.domain}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const init: RequestInit = {
      method,
      headers: {
        "content-type": "application/json",
        "x-yunxiao-token": this.token
      }
    };

    if (body) {
      init.body = JSON.stringify(compactBody(body));
    }

    const response = await this.fetcher(url.toString(), init);
    const text = await response.text();
    if (!response.ok) {
      throw new YunxiaoApiError(`Yunxiao API request failed with HTTP ${response.status}`, response.status, text);
    }

    if (!text) {
      return null;
    }

    return JSON.parse(text);
  }
}

function stripProtocol(domain: string): string {
  return domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function compactBody<T extends Record<string, unknown>>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Partial<T>;
}
