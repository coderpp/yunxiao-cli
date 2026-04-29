import {
  YunxiaoClient,
  type Fetcher,
  type ListChangeRequestsOptions,
  type ListLatestFailedPipelineRunsOptions,
  type ListPipelineRunsOptions,
  type MergeChangeRequestOptions,
  type SearchProjectsOptions,
  type SearchWorkitemsOptions,
  type UpdateWorkitemOptions
} from "./client.js";

export interface CliIo {
  fetcher?: Fetcher;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

interface ParsedArgs {
  positionals: string[];
  flags: Flags;
}

type OutputFormat = "table" | "json";
type FlagScalar = string | boolean;
type FlagValue = FlagScalar | FlagScalar[];
type Flags = Record<string, FlagValue>;

const mergeTypes = new Set(["ff-only", "no-fast-forward", "squash", "rebase"]);
const outputFormats = new Set<OutputFormat>(["table", "json"]);
const booleanFlags = new Set(["all-pages", "create-only", "help", "json", "remove-source-branch", "yes"]);
const workitemStateNames = new Map([
  ["todo", ["TODO", "待处理", "待办"]],
  ["opened", ["TODO", "待处理", "待办"]],
  ["doing", ["DOING", "IN_PROGRESS", "PROCESSING", "进行中", "处理中"]],
  ["in-progress", ["DOING", "IN_PROGRESS", "PROCESSING", "进行中", "处理中"]],
  ["done", ["DONE", "COMPLETED", "CLOSED", "已完成", "完成", "已关闭"]],
  ["completed", ["DONE", "COMPLETED", "CLOSED", "已完成", "完成", "已关闭"]]
]);

export async function runCli(args = process.argv.slice(2), env = process.env, io: CliIo = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));

  try {
    const parsed = parseArgs(args);
    if (parsed.positionals.length === 0 || parsed.flags.help) {
      stdout(helpText());
      return 0;
    }

    const [scope, command] = parsed.positionals;
    if (!command) {
      throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
    }

    const outputFormat = outputFormatFromFlags(parsed.flags);
    const client = createClient(parsed.flags, env, io.fetcher);
    const result = await runCommand(scope, command, parsed, client, env);

    printResult(result, outputFormat, stdout);
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function runCommand(
  scope: string,
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
  env: NodeJS.ProcessEnv
): Promise<unknown> {
  switch (scope) {
    case "mr":
      return runMergeRequestCommand(command, parsed, client);
    case "project":
      return runProjectCommand(command, parsed, client);
    case "member":
      return runMemberCommand(command, parsed, client);
    case "pipeline":
    case "pl":
      return runPipelineCommand(command, parsed, client);
    case "workitem":
    case "wi":
      return runWorkitemCommand(command, parsed, client, env);
    default:
      throw new Error(`Unknown command scope: ${scope}`);
  }
}

async function runMergeRequestCommand(command: string, parsed: ParsedArgs, client: YunxiaoClient): Promise<unknown> {
  const [, , repositoryId, localIdRaw] = parsed.positionals;

  if (command === "list") {
    return client.listChangeRequests(listOptions(parsed.flags));
  }

  if (!repositoryId || !localIdRaw) {
    throw new Error(`Command mr ${command} requires <repositoryId> and <localId>.`);
  }

  if (command === "release") {
    requireConfirmation(parsed.flags);
    return client.releaseByRepositoryName({
      repositoryName: repositoryId,
      sourceBranch: localIdRaw,
      targetBranch: requiredPositional(parsed.positionals[4], "targetBranch"),
      createOnly: hasFlag(parsed.flags, "create-only"),
      title: optionalString(parsed.flags.title),
      description: optionalString(parsed.flags.description),
      mergeType: mergeOptions(parsed.flags).mergeType
    });
  }

  const localId = parseLocalId(localIdRaw);

  switch (command) {
    case "review":
      return client.reviewChangeRequest(repositoryId, localId, {
        reviewComment: optionalString(parsed.flags.comment)
      });
    case "merge":
      requireConfirmation(parsed.flags);
      return client.mergeChangeRequest(repositoryId, localId, mergeOptions(parsed.flags));
    case "approve-and-merge":
      requireConfirmation(parsed.flags);
      return client.approveAndMerge(repositoryId, localId, {
        reviewComment: optionalString(parsed.flags.comment),
        ...mergeOptions(parsed.flags)
      });
    case "tree":
      return client.getChangeRequestTree(repositoryId, localId, {
        fromPatchSetId: requiredFlag(parsed.flags, "from-patch-set-id"),
        toPatchSetId: requiredFlag(parsed.flags, "to-patch-set-id")
      });
    case "patches":
      return client.listChangeRequestPatchSets(repositoryId, localId);
    default:
      throw new Error(`Unknown mr command: ${command}`);
  }
}

async function runProjectCommand(command: string, parsed: ParsedArgs, client: YunxiaoClient): Promise<unknown> {
  const projectId = parsed.positionals[2];

  switch (command) {
    case "list":
    case "search":
      return client.searchProjects(projectSearchOptions(parsed.flags));
    case "get":
      return client.getProject(requiredPositional(projectId, "projectId"));
    case "members":
      return client.listProjectMembers(requiredPositional(projectId, "projectId"), {
        name: optionalString(parsed.flags.name),
        roleId: optionalString(parsed.flags["role-id"])
      });
    case "member-add":
    case "add-member":
      requireConfirmation(parsed.flags);
      return client.createProjectMember(requiredPositional(projectId, "projectId"), {
        operatorId: optionalString(parsed.flags["operator-id"]),
        roleId: optionalString(parsed.flags["role-id"]) ?? "project.participant",
        userIds: requiredCsvFlag(parsed.flags, "user-ids")
      });
    case "member-remove":
    case "remove-member":
      requireConfirmation(parsed.flags);
      return client.deleteProjectMember(requiredPositional(projectId, "projectId"), {
        operatorId: optionalString(parsed.flags["operator-id"]),
        roleId: optionalString(parsed.flags["role-id"]) ?? "project.participant",
        userIds: requiredCsvFlag(parsed.flags, "user-ids")
      });
    default:
      throw new Error(`Unknown project command: ${command}`);
  }
}

async function runMemberCommand(command: string, parsed: ParsedArgs, client: YunxiaoClient): Promise<unknown> {
  switch (command) {
    case "list":
      return client.listMembers({
        page: optionalNumber(parsed.flags.page),
        perPage: optionalNumber(parsed.flags["per-page"])
      });
    case "get":
      return client.getMember(requiredPositional(parsed.positionals[2], "memberId"));
    default:
      throw new Error(`Unknown member command: ${command}`);
  }
}

async function runPipelineCommand(command: string, parsed: ParsedArgs, client: YunxiaoClient): Promise<unknown> {
  if (command === "failed-runs" || command === "failed" || command === "latest-failed-runs") {
    return client.listLatestFailedPipelineRuns(latestFailedPipelineRunsOptions(parsed.flags));
  }

  const pipelineId = requiredPositional(parsed.positionals[2], "pipelineId");
  const pipelineRunId = parsed.positionals[3];
  const jobId = parsed.positionals[4];

  switch (command) {
    case "runs":
    case "list-runs":
      return client.listPipelineRuns(pipelineId, pipelineRunsOptions(parsed.flags));
    case "run":
    case "get-run":
    case "get":
      return client.getPipelineRun(pipelineId, requiredPositional(pipelineRunId, "pipelineRunId"));
    case "retry-job":
    case "retry":
      requireConfirmation(parsed.flags);
      return client.retryPipelineJobRun(
        pipelineId,
        requiredPositional(pipelineRunId, "pipelineRunId"),
        requiredPositional(jobId, "jobId")
      );
    default:
      throw new Error(`Unknown pipeline command: ${command}`);
  }
}

async function runWorkitemCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
  env: NodeJS.ProcessEnv
): Promise<unknown> {
  const workitemId = parsed.positionals[2];

  switch (command) {
    case "list":
    case "search":
      return searchWorkitems(client, parsed.flags, env);
    case "mine": {
      const currentUser = await client.getCurrentUser();
      return searchWorkitems(client, { ...parsed.flags, "assigned-to": currentUser.id }, env);
    }
    case "get":
      return client.getWorkitem(requiredPositional(workitemId, "workitemId"));
    case "update":
      requireConfirmation(parsed.flags);
      return client.updateWorkitem(requiredPositional(workitemId, "workitemId"), workitemUpdateBody(parsed.flags));
    case "activities":
      return client.listWorkitemActivities(requiredPositional(workitemId, "workitemId"));
    case "comments":
      return client.listWorkitemComments(requiredPositional(workitemId, "workitemId"));
    case "comment":
    case "comment-create":
      requireConfirmation(parsed.flags);
      return client.createWorkitemComment(requiredPositional(workitemId, "workitemId"), {
        content: requiredFlag(parsed.flags, "content"),
        operatorId: optionalString(parsed.flags["operator-id"]),
        parentId: optionalString(parsed.flags["parent-id"])
      });
    case "timeline":
    case "history":
      return client.getWorkitemTimeline(requiredPositional(workitemId, "workitemId"));
    default:
      throw new Error(`Unknown workitem command: ${command}`);
  }
}

function createClient(flags: Flags, env: NodeJS.ProcessEnv, fetcher?: Fetcher): YunxiaoClient {
  return new YunxiaoClient({
    token: stringFlag(flags.token) ?? env.YUNXIAO_TOKEN ?? "",
    domain: stringFlag(flags.domain) ?? env.YUNXIAO_DOMAIN ?? "openapi-rdc.aliyuncs.com",
    organizationId: stringFlag(flags["organization-id"]) ?? env.YUNXIAO_ORGANIZATION_ID,
    edition: (stringFlag(flags.edition) ?? env.YUNXIAO_EDITION) as "center" | "region" | undefined,
    fetcher
  });
}

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      setFlag(flags, rawName, inlineValue);
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--") && !booleanFlags.has(rawName)) {
      setFlag(flags, rawName, next);
      index += 1;
    } else {
      setFlag(flags, rawName, true);
    }
  }

  return { positionals, flags };
}

function setFlag(flags: Flags, name: string, value: FlagValue): void {
  const existing = flags[name];
  if (existing === undefined) {
    flags[name] = value;
    return;
  }

  flags[name] = [...flagValues(existing), ...flagValues(value)];
}

function listOptions(flags: Flags): ListChangeRequestsOptions {
  return {
    page: optionalNumber(flags.page),
    perPage: optionalNumber(flags["per-page"]),
    projectIds: optionalString(flags["project-ids"]),
    authorIds: optionalString(flags["author-ids"]),
    reviewerIds: optionalString(flags["reviewer-ids"]),
    state: optionalString(flags.state),
    search: optionalString(flags.search),
    orderBy: optionalString(flags["order-by"]),
    sort: optionalString(flags.sort),
    createdBefore: optionalString(flags["created-before"]),
    createdAfter: optionalString(flags["created-after"])
  };
}

function projectSearchOptions(flags: Flags): SearchProjectsOptions {
  return {
    conditions: optionalString(flags.conditions) ?? projectNameConditions(optionalString(flags.name)),
    extraConditions: optionalString(flags["extra-conditions"]),
    orderBy: optionalString(flags["order-by"]) ?? "gmtCreate",
    page: optionalNumber(flags.page) ?? 1,
    perPage: optionalNumber(flags["per-page"]) ?? 20,
    sort: optionalString(flags.sort) ?? "desc"
  };
}

function pipelineRunsOptions(flags: Flags): ListPipelineRunsOptions {
  return {
    page: optionalNumber(flags.page),
    perPage: optionalNumber(flags["per-page"]),
    startTime: optionalNumber(flags["start-time"]),
    endTime: optionalNumber(flags["end-time"]) ?? optionalNumber(flags["end-tme"]),
    status: optionalString(flags.status),
    triggerMode: optionalNumber(flags["trigger-mode"])
  };
}

function latestFailedPipelineRunsOptions(flags: Flags): ListLatestFailedPipelineRunsOptions {
  return {
    hours: optionalNumber(flags.hours) ?? 24,
    startTime: optionalNumber(flags["start-time"]),
    endTime: optionalNumber(flags["end-time"]) ?? optionalNumber(flags["end-tme"]),
    perPage: optionalNumber(flags["per-page"]) ?? 30
  };
}

async function searchWorkitems(client: YunxiaoClient, flags: Flags, env: NodeJS.ProcessEnv): Promise<unknown> {
  const projectIds = workitemProjectIds(flags, env);
  const perPage = optionalNumber(flags["per-page"]) ?? 20;
  const firstPage = optionalNumber(flags.page) ?? 1;
  const results: unknown[] = [];

  for (const projectId of projectIds) {
    let page = firstPage;
    while (true) {
      const response = await client.searchWorkitems(workitemSearchOptions(flags, projectId, page, perPage, env));
      const rows = Array.isArray(response) ? response : [response];
      results.push(...rows.map((row) => addQueryProjectId(row, projectId)));

      if (!hasFlag(flags, "all-pages") || !Array.isArray(response) || response.length < perPage) {
        break;
      }
      page += 1;
    }
  }

  return filterWorkitems(results, flags);
}

function workitemSearchOptions(
  flags: Flags,
  projectId: string,
  page: number,
  perPage: number,
  env: NodeJS.ProcessEnv
): SearchWorkitemsOptions {
  return {
    category: optionalString(flags.category) ?? env.YUNXIAO_WORKITEM_CATEGORIES ?? "Req,Task,Bug",
    conditions: workitemConditions(flags),
    orderBy: optionalString(flags["order-by"]) ?? "gmtCreate",
    page,
    perPage,
    sort: optionalString(flags.sort) ?? "desc",
    spaceId: projectId,
    spaceType: optionalString(flags["space-type"]) ?? "Project"
  };
}

function workitemConditions(flags: Flags): string | undefined {
  const rawConditions = optionalString(flags.conditions);
  const filters: Array<Record<string, unknown>> = [];
  const assignedTo = optionalString(flags["assigned-to"]) ?? optionalString(flags.assignee);
  const creator = optionalString(flags.creator);
  const statusIds = optionalString(flags["status-ids"]);
  const subject = optionalString(flags.subject);
  const from = optionalString(flags.from) ?? optionalString(flags["created-after"]);
  const to = optionalString(flags.to) ?? optionalString(flags["created-before"]);

  if (rawConditions && (assignedTo || creator || statusIds || subject || from || to)) {
    throw new Error("--conditions cannot be combined with shortcut workitem filters.");
  }
  if (rawConditions) {
    return rawConditions;
  }

  if (assignedTo) {
    filters.push(userCondition("assignedTo", csvValues(assignedTo)));
  }
  if (creator) {
    filters.push(userCondition("creator", csvValues(creator)));
  }
  if (statusIds) {
    filters.push({
      fieldIdentifier: "status",
      operator: "CONTAINS",
      value: csvValues(statusIds),
      toValue: null,
      className: "status",
      format: "list"
    });
  }
  if (subject) {
    filters.push({
      fieldIdentifier: "subject",
      operator: "CONTAINS",
      value: [subject],
      toValue: null,
      className: "string",
      format: "input"
    });
  }
  if (from || to) {
    filters.push({
      fieldIdentifier: optionalString(flags["date-field"]) ?? "gmtCreate",
      operator: "BETWEEN",
      value: from ? [from] : [],
      toValue: to ?? null,
      className: "dateTime",
      format: "input"
    });
  }

  return filters.length > 0 ? JSON.stringify({ conditionGroups: [filters] }) : undefined;
}

function userCondition(fieldIdentifier: string, value: string[]): Record<string, unknown> {
  return {
    fieldIdentifier,
    operator: "CONTAINS",
    value,
    toValue: null,
    className: "user",
    format: "list"
  };
}

function workitemUpdateBody(flags: Flags): UpdateWorkitemOptions {
  const body: UpdateWorkitemOptions = {
    ...jsonObjectFlag(flags.fields)
  };

  for (const field of flagStrings(flags.field)) {
    const [key, value] = parseKeyValue(field, "--field");
    body[key] = parseValue(value);
  }

  const assignedTo = optionalString(flags["assigned-to"]) ?? optionalString(flags.assignee);
  if (assignedTo) {
    body.assignedTo = assignedTo;
  }

  const participants = optionalString(flags.participants);
  if (participants) {
    body.participants = csvValues(participants);
  }

  const dueDate = optionalString(flags["due-date"]) ?? optionalString(flags["plan-finish-at"]);
  if (dueDate) {
    body[optionalString(flags["due-field"]) ?? "dueDate"] = dueDate;
  }

  if (Object.keys(body).length === 0) {
    throw new Error("No workitem fields to update. Use --assigned-to, --participants, --due-date, --fields, or --field.");
  }

  return body;
}

function mergeOptions(flags: Flags): MergeChangeRequestOptions {
  const mergeType = optionalString(flags["merge-type"]) ?? "no-fast-forward";
  if (!mergeTypes.has(mergeType)) {
    throw new Error(`Invalid --merge-type: ${mergeType}`);
  }

  return {
    mergeMessage: optionalString(flags.message),
    mergeType: mergeType as MergeChangeRequestOptions["mergeType"],
    removeSourceBranch: hasFlag(flags, "remove-source-branch")
  };
}

function requireConfirmation(flags: Flags): void {
  if (!hasFlag(flags, "yes")) {
    throw new Error("This command changes state. Re-run with --yes after you have reviewed the operation.");
  }
}

function outputFormatFromFlags(flags: Flags): OutputFormat {
  const requestedOutput = optionalString(flags.output);
  if (hasFlag(flags, "json") && requestedOutput && requestedOutput !== "json") {
    throw new Error("--json cannot be combined with --output table.");
  }

  const output = hasFlag(flags, "json") ? "json" : requestedOutput ?? "table";
  if (!outputFormats.has(output as OutputFormat)) {
    throw new Error(`Invalid --output: ${output}. Supported formats: table, json.`);
  }

  return output as OutputFormat;
}

function printResult(result: unknown, outputFormat: OutputFormat, stdout: (text: string) => void): void {
  if (outputFormat === "json") {
    stdout(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (Array.isArray(result)) {
    stdout(formatTable(result));
    return;
  }

  if (isRecord(result)) {
    stdout(formatKeyValueTable(result));
    return;
  }

  if (result === null || result === undefined) {
    stdout("No result.\n");
    return;
  }

  stdout(`${String(result)}\n`);
}

function formatTable(rows: unknown[]): string {
  if (rows.length === 0) {
    return "No records found.\n";
  }

  const normalizedRows = rows.map((row) => (isRecord(row) ? row : { value: row }));
  const preferredKeys = [
    "pipelineName",
    "pipelineRunId",
    "pipelineId",
    "localId",
    "projectId",
    "queryProjectId",
    "id",
    "serialNumber",
    "name",
    "subject",
    "title",
    "state",
    "status",
    "triggerMode",
    "triggerModeName",
    "startTime",
    "startTimeText",
    "endTime",
    "endTimeText",
    "createTime",
    "assignedTo",
    "userId",
    "userName",
    "roleName",
    "email",
    "sourceBranch",
    "targetBranch",
    "detailUrl"
  ].filter((key) => normalizedRows.some((row) => row[key] !== undefined));
  const keys = preferredKeys.length > 0 ? preferredKeys : uniqueKeys(normalizedRows);
  const widths = keys.map((key) =>
    Math.max(key.length, ...normalizedRows.map((row) => formatCellValue(row[key]).length))
  );
  const line = (values: string[]) => values.map((value, index) => value.padEnd(widths[index])).join("  ");

  return [
    line(keys),
    line(keys.map((_, index) => "-".repeat(widths[index]))),
    ...normalizedRows.map((row) => line(keys.map((key) => formatCellValue(row[key]))))
  ].join("\n") + "\n";
}

function uniqueKeys(rows: Array<Record<string, unknown>>): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function formatKeyValueTable(record: Record<string, unknown>): string {
  const rows = Object.entries(record).map(([key, value]) => ({
    key,
    value: formatCellValue(value)
  }));

  return formatTable(rows);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(formatCellValue).join(",");
  }

  if (isRecord(value)) {
    const displayValue = value.displayName ?? value.name ?? value.userName ?? value.title ?? value.id;
    if (displayValue !== undefined) {
      return String(displayValue);
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function parseLocalId(value: string): number {
  const localId = Number(value);
  if (!Number.isInteger(localId) || localId <= 0) {
    throw new Error(`<localId> must be a positive integer: ${value}`);
  }

  return localId;
}

function requiredPositional(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required positional argument <${name}>.`);
  }

  return value;
}

function requiredFlag(flags: Flags, name: string): string {
  const value = optionalString(flags[name]);
  if (!value) {
    throw new Error(`Missing required flag --${name}.`);
  }

  return value;
}

function requiredCsvFlag(flags: Flags, name: string): string[] {
  return csvValues(requiredFlag(flags, name));
}

function projectNameConditions(name: string | undefined): string | undefined {
  if (!name) {
    return undefined;
  }

  return JSON.stringify({
    conditionGroups: [
      [
        {
          className: "string",
          fieldIdentifier: "name",
          format: "input",
          operator: "CONTAINS",
          toValue: null,
          value: [name]
        }
      ]
    ]
  });
}

function workitemProjectIds(flags: Flags, env: NodeJS.ProcessEnv): string[] {
  const value = optionalString(flags["project-ids"]) ?? optionalString(flags["project-id"]) ?? env.YUNXIAO_PROJECT_IDS;
  if (!value) {
    throw new Error("Missing workitem project scope. Set --project-id, --project-ids, or YUNXIAO_PROJECT_IDS.");
  }

  return csvValues(value);
}

function addQueryProjectId(row: unknown, projectId: string): unknown {
  return isRecord(row) ? { queryProjectId: projectId, ...row } : row;
}

function filterWorkitems(rows: unknown[], flags: Flags): unknown[] {
  const state = optionalString(flags.state);
  const statusNameEn = optionalString(flags["status-name-en"]);
  const statusName = optionalString(flags["status-name"]);

  return rows.filter((row) => {
    if (!isRecord(row)) {
      return true;
    }

    if (statusNameEn && statusText(row.status, "nameEn") !== statusNameEn) {
      return false;
    }
    if (statusName && statusText(row.status, "name") !== statusName && statusText(row.status, "displayName") !== statusName) {
      return false;
    }
    if (state && state !== "all") {
      const expected = workitemStateNames.get(state);
      if (!expected) {
        throw new Error(`Invalid --state: ${state}. Supported values: todo, doing, in-progress, done, completed, all.`);
      }

      const actualValues = [
        statusText(row.status, "nameEn"),
        statusText(row.status, "name"),
        statusText(row.status, "displayName")
      ].filter((value): value is string => Boolean(value));
      return actualValues.some((actual) => expected.includes(actual));
    }

    return true;
  });
}

function statusText(value: unknown, key: "displayName" | "name" | "nameEn"): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const text = value[key];
  return typeof text === "string" ? text : undefined;
}

function jsonObjectFlag(value: FlagValue | undefined): Record<string, unknown> {
  const raw = optionalString(value);
  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed) || Array.isArray(parsed)) {
    throw new Error("--fields must be a JSON object.");
  }

  return parsed;
}

function parseKeyValue(value: string, flagName: string): [string, string] {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`${flagName} expects key=value, got: ${value}`);
  }

  return [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)];
}

function parseValue(value: string): unknown {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (/^[\[{]/.test(value)) {
    return JSON.parse(value) as unknown;
  }

  return value;
}

function csvValues(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function flagValues(value: FlagValue): FlagScalar[] {
  return Array.isArray(value) ? value : [value];
}

function flagStrings(value: FlagValue | undefined): string[] {
  if (value === undefined) {
    return [];
  }

  return flagValues(value).filter((item): item is string => typeof item === "string");
}

function hasFlag(flags: Flags, name: string): boolean {
  const value = flags[name];
  return value === true || (Array.isArray(value) && value.includes(true));
}

function optionalString(value: FlagValue | undefined): string | undefined {
  if (Array.isArray(value)) {
    return [...value].reverse().find((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? value : undefined;
}

function stringFlag(value: FlagValue | undefined): string | undefined {
  return optionalString(value);
}

function optionalNumber(value: FlagValue | undefined): number | undefined {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return undefined;
  }

  const number = Number(stringValue);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Expected a positive integer, got: ${stringValue}`);
  }

  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function helpText(): string {
  return `yunxiao - Yunxiao DevOps command helper

Usage:
  yunxiao mr list [--state opened] [--project-ids 2813489] [--output table|json]
  yunxiao mr review <repositoryId> <localId> [--comment "LGTM"] [--output table|json]
  yunxiao mr merge <repositoryId> <localId> --yes [--merge-type no-fast-forward] [--output table|json]
  yunxiao mr approve-and-merge <repositoryId> <localId> --yes [--merge-type no-fast-forward] [--output table|json]
  yunxiao mr release <repositoryName> <sourceBranch> <targetBranch> --yes [--create-only] [--title "Release"] [--output table|json]
  yunxiao mr tree <repositoryId> <localId> --from-patch-set-id <id> --to-patch-set-id <id> [--output table|json]
  yunxiao mr patches <repositoryId> <localId> [--output table|json]
  yunxiao project list [--name keyword] [--output table|json]
  yunxiao project get <projectId> [--output table|json]
  yunxiao project members <projectId> [--name keyword] [--role-id project.admin] [--output table|json]
  yunxiao project member-add <projectId> --user-ids user1,user2 [--role-id project.participant] --yes
  yunxiao project member-remove <projectId> --user-ids user1,user2 [--role-id project.participant] --yes
  yunxiao member list [--page 1] [--per-page 100] [--output table|json]
  yunxiao member get <memberId> [--output table|json]
  yunxiao pipeline failed-runs [--hours 24] [--output table|json]
  yunxiao pipeline runs <pipelineId> [--status FAIL] [--start-time 1729178040000] [--end-time 1729181640000] [--output table|json]
  yunxiao pipeline run <pipelineId> <pipelineRunId> [--output table|json]
  yunxiao pipeline retry-job <pipelineId> <pipelineRunId> <jobId> --yes [--output table|json]
  yunxiao workitem list --project-ids p1,p2 [--assigned-to userId] [--state todo|doing|done] [--from "2026-04-01 00:00:00"] [--to "2026-04-30 23:59:59"]
  yunxiao workitem mine --project-ids p1,p2 [--state todo|doing|done] [--output table|json]
  yunxiao workitem get <workitemId> [--output table|json]
  yunxiao workitem update <workitemId> --yes [--assigned-to userId] [--participants user1,user2] [--due-date "2026-05-01 18:00:00"] [--field key=value]
  yunxiao workitem activities <workitemId> [--output table|json]
  yunxiao workitem comments <workitemId> [--output table|json]
  yunxiao workitem comment <workitemId> --content "comment" --yes [--output table|json]
  yunxiao workitem timeline <workitemId> [--output table|json]

Output:
  --output table             Plain text table output, default
  --output json              Pretty JSON output
  --json                     Alias for --output json

Config:
  YUNXIAO_TOKEN              Personal access token
  YUNXIAO_DOMAIN             API domain, default openapi-rdc.aliyuncs.com
  YUNXIAO_ORGANIZATION_ID    Required for center edition
  YUNXIAO_EDITION            center or region
  YUNXIAO_PROJECT_IDS        Default comma-separated project IDs for workitem commands
  YUNXIAO_WORKITEM_CATEGORIES Default workitem categories, default Req,Task,Bug
`;
}
