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

export interface ListRepositoriesOptions {
  page?: number;
  perPage?: number;
  orderBy?: "created_at" | "updated_at" | "last_activity_at" | string;
  sort?: "asc" | "desc" | string;
  search?: string;
  archived?: boolean;
}

export interface SearchProjectsOptions {
  conditions?: string;
  extraConditions?: string;
  orderBy?: "gmtCreate" | "name" | string;
  page?: number;
  perPage?: number;
  sort?: "asc" | "desc" | string;
}

export interface ListProjectMembersOptions {
  name?: string;
  roleId?: string;
}

export interface ChangeProjectMemberOptions {
  operatorId?: string;
  roleId: string;
  userIds: string[];
}

export interface DeleteProjectMemberOptions {
  operatorId?: string;
  roleId: string;
  userIds: string[];
}

export interface ListMembersOptions {
  page?: number;
  perPage?: number;
}

export interface SearchWorkitemsOptions {
  category: string;
  conditions?: string;
  orderBy?: "gmtCreate" | "gmtModified" | "updateStatusAt" | "name" | string;
  page?: number;
  perPage?: number;
  sort?: "asc" | "desc" | string;
  spaceId: string;
  spaceType?: "Project" | "Program" | string;
}

export interface CreateWorkitemCommentOptions {
  content: string;
  operatorId?: string;
  parentId?: string;
}

export type UpdateWorkitemOptions = Record<string, unknown>;

export interface ListPipelineRunsOptions {
  page?: number;
  perPage?: number;
  startTime?: number;
  endTime?: number;
  status?: "FAIL" | "SUCCESS" | "RUNNING" | string;
  triggerMode?: number;
}

export interface ListPipelinesOptions {
  createStartTime?: number;
  createEndTime?: number;
  executeStartTime?: number;
  executeEndTime?: number;
  pipelineName?: string;
  statusList?: string;
  page?: number;
  perPage?: number;
}

export interface ListLatestFailedPipelineRunsOptions {
  hours?: number;
  startTime?: number;
  endTime?: number;
  perPage?: number;
}

export interface LatestFailedPipelineRun {
  pipelineId: number | string;
  pipelineName: string;
  pipelineRunId: number | string;
  status?: string;
  triggerMode?: number | string;
  triggerModeName: string;
  startTime?: number | string;
  startTimeText: string;
  endTime?: number | string;
  endTimeText: string;
  creatorAccountId?: string;
}

export interface RepositorySummary {
  id: number | string;
  name?: string;
  path?: string;
  nameWithNamespace?: string;
  pathWithNamespace?: string;
}

export interface CurrentUser {
  id: string;
  name?: string;
  username?: string;
  email?: string;
}

export interface CreateChangeRequestOptions {
  sourceBranch: string;
  sourceProjectId: number | string;
  targetBranch: string;
  targetProjectId: number | string;
  title: string;
  createFrom?: "WEB" | "COMMAND_LINE";
  description?: string;
  reviewerUserIds?: string[];
  triggerAIReviewRun?: boolean;
  workItemIds?: string;
}

export interface ReleaseByRepositoryNameOptions {
  repositoryName: string;
  sourceBranch: string;
  targetBranch: string;
  createOnly?: boolean;
  title?: string;
  description?: string;
  mergeType?: MergeChangeRequestOptions["mergeType"];
}

export interface ReleaseResult {
  repository: RepositorySummary;
  changeRequest: unknown;
  review: unknown | null;
  merge: unknown | null;
}

export interface ApproveAndMergeOptions extends ReviewChangeRequestOptions, MergeChangeRequestOptions {}

export class YunxiaoApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: string,
    readonly method: string,
    readonly url: string
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

  getCurrentUser(): Promise<CurrentUser> {
    return this.request("GET", "/oapi/v1/platform/user") as Promise<CurrentUser>;
  }

  listRepositories(options: ListRepositoriesOptions = {}): Promise<RepositorySummary[]> {
    return this.request("GET", this.repositoriesPath(), options) as Promise<RepositorySummary[]>;
  }

  searchProjects(options: SearchProjectsOptions = {}): Promise<unknown> {
    return this.request("POST", this.projexPath("/projects:search"), undefined, options as Record<string, unknown>);
  }

  getProject(projectId: string): Promise<unknown> {
    return this.request("GET", this.projectPath(projectId));
  }

  listProjectMembers(projectId: string, options: ListProjectMembersOptions = {}): Promise<unknown> {
    return this.request("GET", `${this.projectPath(projectId)}/members`, options);
  }

  createProjectMember(projectId: string, options: ChangeProjectMemberOptions): Promise<unknown> {
    return this.request("POST", `${this.projectPath(projectId)}/members`, undefined, {
      operatorId: options.operatorId,
      roleId: options.roleId,
      userIds: options.userIds
    });
  }

  deleteProjectMember(projectId: string, options: DeleteProjectMemberOptions): Promise<unknown> {
    return this.request("DELETE", `${this.projectPath(projectId)}/members`, undefined, {
      operatorId: options.operatorId,
      roleIds: [options.roleId],
      userId: options.userIds.length === 1 ? options.userIds[0] : undefined,
      userIds: options.userIds.length > 1 ? options.userIds : undefined
    });
  }

  listMembers(options: ListMembersOptions = {}): Promise<unknown> {
    return this.request("GET", this.platformMembersPath(), options);
  }

  getMember(memberId: string): Promise<unknown> {
    return this.request("GET", `${this.platformMembersPath()}/${encodePathSegment(memberId)}`);
  }

  searchWorkitems(options: SearchWorkitemsOptions): Promise<unknown> {
    return this.request("POST", this.workitemsSearchPath(), undefined, {
      category: options.category,
      conditions: options.conditions,
      orderBy: options.orderBy,
      page: options.page,
      perPage: options.perPage,
      sort: options.sort,
      spaceId: options.spaceId,
      spaceType: options.spaceType ?? "Project"
    });
  }

  getWorkitem(workitemId: string): Promise<unknown> {
    return this.request("GET", `${this.projexPath("/workitems")}/${encodePathSegment(workitemId)}`);
  }

  updateWorkitem(workitemId: string, options: UpdateWorkitemOptions): Promise<unknown> {
    return this.request("PUT", `${this.projexPath("/workitems")}/${encodePathSegment(workitemId)}`, undefined, options);
  }

  listWorkitemActivities(workitemId: string): Promise<unknown> {
    return this.request("GET", `${this.projexPath("/workitems")}/${encodePathSegment(workitemId)}/activities`);
  }

  listWorkitemComments(workitemId: string): Promise<unknown> {
    return this.request("GET", `${this.projexPath("/workitems")}/${encodePathSegment(workitemId)}/comments`);
  }

  createWorkitemComment(workitemId: string, options: CreateWorkitemCommentOptions): Promise<unknown> {
    return this.request("POST", `${this.projexPath("/workitems")}/${encodePathSegment(workitemId)}/comments`, undefined, {
      content: options.content,
      operatorId: options.operatorId,
      parentId: options.parentId
    });
  }

  async getWorkitemTimeline(workitemId: string): Promise<unknown> {
    const [workitem, activities, comments] = await Promise.all([
      this.getWorkitem(workitemId),
      this.listWorkitemActivities(workitemId),
      this.listWorkitemComments(workitemId)
    ]);

    return { workitem, activities, comments };
  }

  listPipelineRuns(pipelineId: string, options: ListPipelineRunsOptions = {}): Promise<unknown> {
    return this.request("GET", `${this.pipelinePath(pipelineId)}/runs`, {
      page: options.page,
      perPage: options.perPage,
      startTime: options.startTime,
      endTme: options.endTime,
      status: options.status,
      triggerMode: options.triggerMode
    });
  }

  listPipelines(options: ListPipelinesOptions = {}): Promise<unknown> {
    return this.request("GET", this.pipelinesPath(), {
      page: options.page,
      perPage: options.perPage,
      executeStartTime: options.executeStartTime,
      executeEndTime: options.executeEndTime,
      statusList: options.statusList,
      pipelineName: options.pipelineName,
      createStartTime: options.createStartTime,
      createEndTime: options.createEndTime
    });
  }

  async listLatestFailedPipelineRuns(
    options: ListLatestFailedPipelineRunsOptions = {}
  ): Promise<LatestFailedPipelineRun[]> {
    const endTime = options.endTime ?? Date.now();
    const startTime = options.startTime ?? endTime - (options.hours ?? 24) * 60 * 60 * 1000;
    const perPage = options.perPage ?? 30;
    const pipelines = await this.listAllPipelines({
      page: 1,
      perPage,
      executeStartTime: startTime,
      executeEndTime: endTime,
      statusList: "FAIL"
    });
    const uniquePipelines = uniqueBy(pipelines, (pipeline) => String(recordValue(pipeline, "pipelineId") ?? recordValue(pipeline, "id")));
    const results: LatestFailedPipelineRun[] = [];

    for (const pipeline of uniquePipelines) {
      const pipelineId = recordValue(pipeline, "pipelineId") ?? recordValue(pipeline, "id");
      if (pipelineId === undefined || pipelineId === null || pipelineId === "") {
        continue;
      }

      const runs = await this.listAllPipelineRuns(String(pipelineId), {
        page: 1,
        perPage,
        startTime,
        endTime,
        status: "FAIL"
      });
      const latestRun = runs
        .filter((run) => timestampInRange(recordValue(run, "startTime"), startTime, endTime))
        .sort((left, right) => Number(recordValue(right, "startTime") ?? 0) - Number(recordValue(left, "startTime") ?? 0))[0];
      if (!latestRun) {
        continue;
      }

      results.push({
        pipelineId: normalizeNumericId(pipelineId),
        pipelineName: stringRecordValue(pipeline, "pipelineName") ?? stringRecordValue(pipeline, "name") ?? "",
        pipelineRunId: normalizeNumericId(recordValue(latestRun, "pipelineRunId") ?? ""),
        status: stringRecordValue(latestRun, "status"),
        triggerMode: numericOrStringValue(recordValue(latestRun, "triggerMode")),
        triggerModeName: triggerModeName(recordValue(latestRun, "triggerMode")),
        startTime: numericOrStringValue(recordValue(latestRun, "startTime")),
        startTimeText: formatTimestamp(recordValue(latestRun, "startTime")),
        endTime: numericOrStringValue(recordValue(latestRun, "endTime")),
        endTimeText: formatTimestamp(recordValue(latestRun, "endTime")),
        creatorAccountId: stringRecordValue(latestRun, "creatorAccountId")
      });
    }

    return results.sort((left, right) => Number(right.startTime ?? 0) - Number(left.startTime ?? 0));
  }

  getPipelineRun(pipelineId: string, pipelineRunId: string): Promise<unknown> {
    return this.request(
      "GET",
      `${this.pipelinePath(pipelineId)}/runs/${encodePathSegment(pipelineRunId)}`
    );
  }

  retryPipelineJobRun(pipelineId: string, pipelineRunId: string, jobId: string): Promise<unknown> {
    return this.request(
      "PUT",
      `${this.pipelinePath(pipelineId)}/pipelineRuns/${encodePathSegment(pipelineRunId)}/jobs/${encodePathSegment(jobId)}/retry`
    );
  }

  createChangeRequest(repositoryId: string, options: CreateChangeRequestOptions): Promise<unknown> {
    return this.request("POST", `${this.repositoryPath(repositoryId)}/changeRequests`, undefined, {
      createFrom: options.createFrom ?? "WEB",
      description: options.description,
      reviewerUserIds: options.reviewerUserIds,
      sourceBranch: options.sourceBranch,
      sourceProjectId: normalizeProjectId(options.sourceProjectId),
      targetBranch: options.targetBranch,
      targetProjectId: normalizeProjectId(options.targetProjectId),
      title: options.title,
      triggerAIReviewRun: options.triggerAIReviewRun ?? false,
      workItemIds: options.workItemIds
    });
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

  async releaseByRepositoryName(options: ReleaseByRepositoryNameOptions): Promise<ReleaseResult> {
    const [currentUser, repositories] = await Promise.all([
      this.getCurrentUser(),
      this.listRepositories({
        page: 1,
        perPage: 20,
        search: options.repositoryName,
        archived: false
      })
    ]);
    const repository = findRepositoryByName(repositories, options.repositoryName);
    if (!repository) {
      throw new Error(`Repository not found by name: ${options.repositoryName}`);
    }

    const repositoryId = String(repository.id);
    const title = options.title ?? `Release ${options.sourceBranch} into ${options.targetBranch}`;
    const changeRequest = await this.createChangeRequest(repositoryId, {
      sourceBranch: options.sourceBranch,
      targetBranch: options.targetBranch,
      sourceProjectId: repository.id,
      targetProjectId: repository.id,
      reviewerUserIds: [currentUser.id],
      title,
      description: options.description
    });
    const localId = localIdFromChangeRequest(changeRequest);
    if (options.createOnly) {
      return {
        repository,
        changeRequest,
        review: null,
        merge: null
      };
    }

    const review = await this.reviewChangeRequest(repositoryId, localId, {
      reviewComment: "Approved by yunxiao-cli release workflow"
    });
    const merge = await this.mergeChangeRequest(repositoryId, localId, {
      mergeType: options.mergeType,
      removeSourceBranch: false
    });

    return {
      repository,
      changeRequest,
      review,
      merge
    };
  }

  private changeRequestsPath(): string {
    if (this.edition === "center") {
      return `/oapi/v1/codeup/organizations/${encodePathSegment(this.organizationId ?? "")}/changeRequests`;
    }

    return "/oapi/v1/codeup/changeRequests";
  }

  private repositoriesPath(): string {
    if (this.edition === "center") {
      return `/oapi/v1/codeup/organizations/${encodePathSegment(this.organizationId ?? "")}/repositories`;
    }

    return "/oapi/v1/codeup/repositories";
  }

  private repositoryPath(repositoryId: string): string {
    const encodedRepositoryId = encodePathSegment(repositoryId);
    if (this.edition === "center") {
      return `/oapi/v1/codeup/organizations/${encodePathSegment(this.organizationId ?? "")}/repositories/${encodedRepositoryId}`;
    }

    return `/oapi/v1/codeup/repositories/${encodedRepositoryId}`;
  }

  private repositoryChangeRequestPath(repositoryId: string, localId: number): string {
    return `${this.repositoryPath(repositoryId)}/changeRequests/${localId}`;
  }

  private projexPath(path: string): string {
    if (this.edition === "center") {
      return `/oapi/v1/projex/organizations/${encodePathSegment(this.organizationId ?? "")}${path}`;
    }

    return `/oapi/v1/projex${path}`;
  }

  private workitemsSearchPath(): string {
    if (this.edition === "center") {
      return this.projexPath("/workitems:search");
    }

    return this.organizationId
      ? `/oapi/v1/projex/${encodePathSegment(this.organizationId)}/workitems:search`
      : "/oapi/v1/projex/workitems:search";
  }

  private projectPath(projectId: string): string {
    return `${this.projexPath("/projects")}/${encodePathSegment(projectId)}`;
  }

  private platformMembersPath(): string {
    if (this.edition === "center") {
      return `/oapi/v1/platform/organizations/${encodePathSegment(this.organizationId ?? "")}/members`;
    }

    return "/oapi/v1/platform/members";
  }

  private pipelinesPath(): string {
    if (this.edition === "center") {
      return `/oapi/v1/flow/organizations/${encodePathSegment(this.organizationId ?? "")}/pipelines`;
    }

    return "/oapi/v1/flow/pipelines";
  }

  private pipelinePath(pipelineId: string): string {
    const encodedPipelineId = encodePathSegment(pipelineId);
    return `${this.pipelinesPath()}/${encodedPipelineId}`;
  }

  private async listAllPipelines(options: ListPipelinesOptions): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = [];
    const perPage = options.perPage ?? 30;

    for (let page = options.page ?? 1; ; page += 1) {
      const response = await this.listPipelines({ ...options, page, perPage });
      const pageRows = arrayRecords(response);
      rows.push(...pageRows);
      if (pageRows.length < perPage) {
        break;
      }
    }

    return rows;
  }

  private async listAllPipelineRuns(
    pipelineId: string,
    options: ListPipelineRunsOptions
  ): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = [];
    const perPage = options.perPage ?? 30;

    for (let page = options.page ?? 1; ; page += 1) {
      const response = await this.listPipelineRuns(pipelineId, { ...options, page, perPage });
      const pageRows = arrayRecords(response);
      rows.push(...pageRows);
      if (pageRows.length < perPage) {
        break;
      }
    }

    return rows;
  }

  private async request(
    method: "GET" | "POST" | "PUT" | "DELETE",
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
      throw new YunxiaoApiError(
        `Yunxiao API request failed with HTTP ${response.status}: ${method} ${url.toString()}${text ? `\n${text}` : ""}`,
        response.status,
        text,
        method,
        url.toString()
      );
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

function arrayRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function stringRecordValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function timestampInRange(value: unknown, startTime: number, endTime: number): boolean {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp >= startTime && timestamp <= endTime;
}

function normalizeNumericId(value: unknown): number | string {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : String(value);
}

function numericOrStringValue(value: unknown): number | string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : String(value);
}

function formatTimestamp(value: unknown): string {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

function triggerModeName(value: unknown): string {
  switch (Number(value)) {
    case 1:
      return "人工触发";
    case 2:
      return "定时触发";
    case 3:
      return "代码提交触发";
    case 5:
      return "流水线触发";
    case 6:
      return "Webhook触发";
    default:
      return value === undefined || value === null ? "" : String(value);
  }
}

function compactBody<T extends Record<string, unknown>>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ) as Partial<T>;
}

function normalizeProjectId(value: number | string): number | string {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return Number.isInteger(numberValue) ? numberValue : value;
}

function findRepositoryByName(repositories: RepositorySummary[], repositoryName: string): RepositorySummary | undefined {
  const normalizedName = normalizeRepositoryName(repositoryName);
  const matches = repositories.filter((repository) =>
    [repository.name, repository.path, repository.nameWithNamespace, repository.pathWithNamespace]
      .filter((value): value is string => typeof value === "string")
      .some((value) => normalizeRepositoryName(value) === normalizedName)
  );

  if (matches.length > 1) {
    throw new Error(`Multiple repositories matched name: ${repositoryName}. Use a more specific path.`);
  }

  return matches[0];
}

function normalizeRepositoryName(value: string): string {
  return value.replace(/\s+\/\s+/g, "/").trim().toLowerCase();
}

function localIdFromChangeRequest(changeRequest: unknown): number {
  if (typeof changeRequest === "object" && changeRequest !== null && "localId" in changeRequest) {
    const localId = Number((changeRequest as { localId: unknown }).localId);
    if (Number.isInteger(localId) && localId > 0) {
      return localId;
    }
  }

  throw new Error("Create change request response did not include a valid localId.");
}
