import { readFileSync } from "node:fs";
import {
  parseArgs,
  validateArgs,
  loadFileFlags,
  commandHelp,
  type ParsedArgs,
  type Flags,
  type FlagValue,
} from "./arguments.js";
import { resolveConfig, configCommand } from "./config.js";
import { CliError, errorInfo, redact } from "./errors.js";
import { paginate } from "./pagination.js";
import { runExtendedMr } from "./mr.js";
import { runExtendedPipeline } from "./pipeline.js";
import {
  readWorkitemContent,
  downloadWorkitemImages,
  downloadWorkitemAttachments,
  parseWorkitemUrl,
} from "./workitem-content.js";
import {
  YunxiaoClient,
  type Fetcher,
  type ListChangeRequestsOptions,
  type ListLatestFailedPipelineRunsOptions,
  type ListPipelineRunsOptions,
  type MergeChangeRequestOptions,
  type SearchProjectsOptions,
  type SearchWorkitemsOptions,
  type UpdateWorkitemOptions,
} from "./client.js";

export interface CliIo {
  fetcher?: Fetcher;
  stdin?: () => Promise<string>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

type OutputFormat = "table" | "json" | "text";
type FlagScalar = string | boolean;
const mergeTypes = new Set(["ff-only", "no-fast-forward", "squash", "rebase"]);
const outputFormats = new Set<OutputFormat>(["table", "json", "text"]);
const workitemStateNames = new Map([
  ["todo", ["TODO", "待处理", "待办"]],
  ["opened", ["TODO", "待处理", "待办"]],
  ["doing", ["DOING", "IN_PROGRESS", "PROCESSING", "进行中", "处理中"]],
  ["in-progress", ["DOING", "IN_PROGRESS", "PROCESSING", "进行中", "处理中"]],
  ["done", ["DONE", "COMPLETED", "CLOSED", "已完成", "完成", "已关闭"]],
  ["completed", ["DONE", "COMPLETED", "CLOSED", "已完成", "完成", "已关闭"]],
]);

export async function runCli(
  args = process.argv.slice(2),
  env = process.env,
  io: CliIo = {},
): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));

  let parsed: ParsedArgs | undefined;
  let effectiveEnv = env;
  try {
    parsed = parseArgs(args);
    if (parsed.flags.version === true) {
      stdout(
        JSON.parse(
          readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
        ).version + "\n",
      );
      return 0;
    }
    if (parsed.positionals.length === 0 || parsed.flags.help === true) {
      stdout(
        parsed.positionals.length
          ? commandHelp(parsed.positionals)
          : "yunxiao - Yunxiao DevOps command helper\n\n" + commandHelp([]),
      );
      return 0;
    }
    validateArgs(parsed);
    await loadFileFlags(parsed.flags, io.stdin);
    const [scope, command] = parsed.positionals;
    const outputFormat = outputFormatFromFlags(parsed.flags);
    if (scope === "config") {
      printResult(
        await configCommand(command, parsed.positionals[2], parsed.flags, env),
        outputFormat,
        stdout,
      );
      return 0;
    }
    effectiveEnv = await resolveConfig(parsed.flags, env);
    if (scope === "doctor" && parsed.flags.remote !== true) {
      const checks = {
        tokenConfigured: !!(parsed.flags.token ?? effectiveEnv.YUNXIAO_TOKEN),
        domain:
          parsed.flags.domain ??
          effectiveEnv.YUNXIAO_DOMAIN ??
          "openapi-rdc.aliyuncs.com",
        edition:
          parsed.flags.edition ??
          effectiveEnv.YUNXIAO_EDITION ??
          ((parsed.flags["organization-id"] ??
          effectiveEnv.YUNXIAO_ORGANIZATION_ID)
            ? "center"
            : "region"),
      };
      createClient(parsed.flags, effectiveEnv, io.fetcher);
      printResult(
        { ...checks, valid: true, remoteChecked: false },
        outputFormat,
        stdout,
      );
      return 0;
    }
    const client = createClient(parsed.flags, effectiveEnv, io.fetcher);
    let result: unknown;
    if (scope === "auth") result = await client.getCurrentUser();
    else if (scope === "doctor")
      result = {
        valid: true,
        remoteChecked: true,
        user: await client.getCurrentUser(),
        writePermissions: "not verified",
      };
    else
      result = await runCommand(
        scope,
        command,
        parsed,
        client,
        effectiveEnv,
        stderr,
      );
    if (outputFormat === "text") {
      const r = result as Record<string, unknown>;
      if (scope === "pipeline") {
        stdout(String(r.content ?? ""));
        if (r.more)
          stderr(
            "Server reports more log content; this is a single snapshot.\n",
          );
      } else {
        stdout(
          (r.files as Array<Record<string, unknown>>)
            .map(
              (f) =>
                `${f.complete ? "" : `# INCOMPLETE: ${f.reason}\n`}${f.diff}`,
            )
            .join("\n"),
        );
        if (!r.complete) stderr("Diff is incomplete; inspect JSON metadata.\n");
      }
    } else
      printResult(
        result,
        scope === "workitem" &&
          ["content", "images", "attachments"].includes(command)
          ? "json"
          : outputFormat,
        stdout,
      );
    return 0;
  } catch (error) {
    const info = errorInfo(error);
    if (
      parsed?.positionals[0] === "mr" &&
      parsed.positionals[1] === "release" &&
      info.details &&
      typeof info.details === "object"
    ) {
      const details = info.details as Record<string, unknown>;
      if (Array.isArray(details.resumeArgs)) {
        const contextArgs = [
          "config",
          "profile",
          "domain",
          "organization-id",
          "edition",
        ].flatMap((key) =>
          typeof parsed!.flags[key] === "string"
            ? [`--${key}`, String(parsed!.flags[key])]
            : [],
        );
        info.details = {
          ...details,
          resumeArgs: [...details.resumeArgs, ...contextArgs],
        };
      }
    }
    const secrets = [
      String(parsed?.flags.token ?? ""),
      effectiveEnv.YUNXIAO_TOKEN ?? "",
    ];
    const json =
      parsed?.flags["error-format"] === "json" ||
      args.includes("--error-format=json") ||
      args.some((v, i) => v === "--error-format" && args[i + 1] === "json");
    stderr(
      redact(
        json
          ? JSON.stringify({
              error: {
                code: info.code,
                message: info.message,
                requestId: info.requestId,
                details: info.details,
              },
            })
          : info.message +
              (info.details ? "\n" + JSON.stringify(info.details) : ""),
        secrets,
      ) + "\n",
    );
    return info.exitCode;
  }
}

async function runCommand(
  scope: string,
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
  env: NodeJS.ProcessEnv,
  warn: (s: string) => void,
): Promise<unknown> {
  const f = parsed.flags;
  const pageOptions = {
    page: optionalNumber(f.page),
    perPage: optionalNumber(f["per-page"]) ?? 20,
    allPages: hasFlag(f, "all-pages"),
    warn,
  };
  if (
    scope === "mr" &&
    [
      "get",
      "diff",
      "comments",
      "comment",
      "create",
      "update",
      "close",
    ].includes(command)
  )
    return runExtendedMr(command, parsed.positionals, f, client);
  if (
    scope === "pipeline" &&
    ["jobs", "logs", "start", "cancel"].includes(command)
  )
    return runExtendedPipeline(command, parsed.positionals, f, client);
  if (scope === "mr" && command === "list")
    return paginate(
      (page, perPage) =>
        client.listChangeRequests({ ...listOptions(f), page, perPage }),
      pageOptions,
    );
  if (scope === "project" && command === "list")
    return paginate(
      (page, perPage) =>
        client.searchProjects({ ...projectSearchOptions(f), page, perPage }),
      pageOptions,
    );
  if (scope === "member" && command === "list")
    return paginate(
      (page, perPage) => client.listMembers({ page, perPage }),
      pageOptions,
    );
  if (scope === "pipeline" && command === "runs")
    return paginate(
      (page, perPage) =>
        client.listPipelineRuns(parsed.positionals[2], {
          ...pipelineRunsOptions(f),
          page,
          perPage,
        }),
      pageOptions,
    );
  if (scope === "pipeline" && command === "list")
    return paginate(
      (page, perPage) =>
        client.listPipelines({
          page,
          perPage,
          pipelineName: optionalString(f.name),
          statusList: optionalString(f.status),
          createStartTime: optionalNumber(f["create-start-time"]),
          createEndTime: optionalNumber(f["create-end-time"]),
          executeStartTime: optionalNumber(f["start-time"]),
          executeEndTime: optionalNumber(f["end-time"]),
        }),
      pageOptions,
    );
  if (scope === "workitem" && ["list", "mine"].includes(command)) {
    const flags =
      command === "mine"
        ? { ...f, "assigned-to": (await client.getCurrentUser()).id }
        : f;
    return searchWorkitems(client, flags, env, warn);
  }
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
      throw new CliError("INVALID_ARGUMENT", `Unknown command scope: ${scope}`);
  }
}

async function runMergeRequestCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
): Promise<unknown> {
  const [, , repositoryId, localIdRaw] = parsed.positionals;

  if (command === "list") {
    return client.listChangeRequests(listOptions(parsed.flags));
  }

  if (!repositoryId || !localIdRaw) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `Command mr ${command} requires <repositoryId> and <localId>.`,
    );
  }

  if (command === "release") {
    requireConfirmation(parsed.flags);
    return client.releaseByRepositoryName({
      repositoryName: repositoryId,
      sourceBranch: localIdRaw,
      targetBranch: requiredPositional(parsed.positionals[4], "targetBranch"),
      createOnly: hasFlag(parsed.flags, "create-only"),
      resume: optionalNumber(parsed.flags.resume),
      title: optionalString(parsed.flags.title),
      description: optionalString(parsed.flags.description),
      mergeType: mergeOptions(parsed.flags).mergeType,
    });
  }

  const localId = parseLocalId(localIdRaw);

  switch (command) {
    case "review":
      return client.reviewChangeRequest(repositoryId, localId, {
        reviewComment: optionalString(parsed.flags.comment),
        reviewOpinion:
          parsed.flags.opinion === "not-pass" ? "NOT_PASS" : "PASS",
      });
    case "merge":
      requireConfirmation(parsed.flags);
      return client.mergeChangeRequest(
        repositoryId,
        localId,
        mergeOptions(parsed.flags),
      );
    case "approve-and-merge":
      requireConfirmation(parsed.flags);
      return client.approveAndMerge(repositoryId, localId, {
        reviewComment: optionalString(parsed.flags.comment),
        ...mergeOptions(parsed.flags),
      });
    case "tree":
      return client.getChangeRequestTree(repositoryId, localId, {
        fromPatchSetId: requiredFlag(parsed.flags, "from-patch-set-id"),
        toPatchSetId: requiredFlag(parsed.flags, "to-patch-set-id"),
      });
    case "patches":
      return client.listChangeRequestPatchSets(repositoryId, localId);
    default:
      throw new CliError("INVALID_ARGUMENT", `Unknown mr command: ${command}`);
  }
}

async function runProjectCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
): Promise<unknown> {
  const projectId = parsed.positionals[2];

  switch (command) {
    case "list":
    case "search":
      return client.searchProjects(projectSearchOptions(parsed.flags));
    case "get":
      return client.getProject(requiredPositional(projectId, "projectId"));
    case "members":
      return client.listProjectMembers(
        requiredPositional(projectId, "projectId"),
        {
          name: optionalString(parsed.flags.name),
          roleId: optionalString(parsed.flags["role-id"]),
        },
      );
    case "member-add":
    case "add-member":
      requireConfirmation(parsed.flags);
      return client.createProjectMember(
        requiredPositional(projectId, "projectId"),
        {
          operatorId: optionalString(parsed.flags["operator-id"]),
          roleId:
            optionalString(parsed.flags["role-id"]) ?? "project.participant",
          userIds: requiredCsvFlag(parsed.flags, "user-ids"),
        },
      );
    case "member-remove":
    case "remove-member":
      requireConfirmation(parsed.flags);
      return client.deleteProjectMember(
        requiredPositional(projectId, "projectId"),
        {
          operatorId: optionalString(parsed.flags["operator-id"]),
          roleId:
            optionalString(parsed.flags["role-id"]) ?? "project.participant",
          userIds: requiredCsvFlag(parsed.flags, "user-ids"),
        },
      );
    default:
      throw new CliError(
        "INVALID_ARGUMENT",
        `Unknown project command: ${command}`,
      );
  }
}

async function runMemberCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
): Promise<unknown> {
  switch (command) {
    case "list":
      return client.listMembers({
        page: optionalNumber(parsed.flags.page),
        perPage: optionalNumber(parsed.flags["per-page"]),
      });
    case "get":
      return client.getMember(
        requiredPositional(parsed.positionals[2], "memberId"),
      );
    default:
      throw new CliError(
        "INVALID_ARGUMENT",
        `Unknown member command: ${command}`,
      );
  }
}

async function runPipelineCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
): Promise<unknown> {
  if (
    command === "failed-runs" ||
    command === "failed" ||
    command === "latest-failed-runs"
  ) {
    return client.listLatestFailedPipelineRuns(
      latestFailedPipelineRunsOptions(parsed.flags),
    );
  }

  const pipelineId = requiredPositional(parsed.positionals[2], "pipelineId");
  const pipelineRunId = parsed.positionals[3];
  const jobId = parsed.positionals[4];

  switch (command) {
    case "runs":
    case "list-runs":
      return client.listPipelineRuns(
        pipelineId,
        pipelineRunsOptions(parsed.flags),
      );
    case "run":
    case "get-run":
    case "get":
      return client.getPipelineRun(
        pipelineId,
        requiredPositional(pipelineRunId, "pipelineRunId"),
      );
    case "retry-job":
    case "retry":
      requireConfirmation(parsed.flags);
      return client.retryPipelineJobRun(
        pipelineId,
        requiredPositional(pipelineRunId, "pipelineRunId"),
        requiredPositional(jobId, "jobId"),
      );
    default:
      throw new CliError(
        "INVALID_ARGUMENT",
        `Unknown pipeline command: ${command}`,
      );
  }
}

async function runWorkitemCommand(
  command: string,
  parsed: ParsedArgs,
  client: YunxiaoClient,
  env: NodeJS.ProcessEnv,
): Promise<unknown> {
  const workitemId = parsed.positionals[2];

  switch (command) {
    case "list":
    case "search":
      return searchWorkitems(client, parsed.flags, env);
    case "mine": {
      const currentUser = await client.getCurrentUser();
      return searchWorkitems(
        client,
        { ...parsed.flags, "assigned-to": currentUser.id },
        env,
      );
    }
    case "content": {
      const link = requiredPositional(workitemId, "workitemUrl");
      const { projectId, workitemId: id } = parseWorkitemUrl(link);
      if (!workitemProjectIds(parsed.flags, env).includes(projectId))
        throw new CliError(
          "INVALID_ARGUMENT",
          "Link project is outside the configured project scope.",
        );
      return readWorkitemContent(client, link, {
        dir: optionalString(parsed.flags.dir) ?? `workitem-${id}-content`,
        timeoutMs: optionalNumber(parsed.flags["timeout-ms"]),
        downloadAttachments: hasFlag(parsed.flags, "download-attachments"),
      });
    }
    case "images":
      return downloadWorkitemImages(
        client,
        requiredPositional(workitemId, "workitemId"),
        {
          timeoutMs: optionalNumber(parsed.flags["timeout-ms"]),
          dir:
            optionalString(parsed.flags.dir) ?? `workitem-${workitemId}-images`,
        },
      );
    case "attachments":
      return downloadWorkitemAttachments(
        client,
        requiredPositional(workitemId, "workitemId"),
        {
          timeoutMs: optionalNumber(parsed.flags["timeout-ms"]),
          dir:
            optionalString(parsed.flags.dir) ??
            `workitem-${workitemId}-attachments`,
        },
      );
    case "get":
      return client.getWorkitem(requiredPositional(workitemId, "workitemId"));
    case "update":
      requireConfirmation(parsed.flags);
      return client.updateWorkitem(
        requiredPositional(workitemId, "workitemId"),
        workitemUpdateBody(parsed.flags),
      );
    case "activities":
      return client.listWorkitemActivities(
        requiredPositional(workitemId, "workitemId"),
      );
    case "comments":
      return client.listWorkitemComments(
        requiredPositional(workitemId, "workitemId"),
      );
    case "comment":
    case "comment-create":
      requireConfirmation(parsed.flags);
      return client.createWorkitemComment(
        requiredPositional(workitemId, "workitemId"),
        {
          content: requiredFlag(parsed.flags, "content"),
          operatorId: optionalString(parsed.flags["operator-id"]),
          parentId: optionalString(parsed.flags["parent-id"]),
        },
      );
    case "timeline":
    case "history":
      return client.getWorkitemTimeline(
        requiredPositional(workitemId, "workitemId"),
      );
    default:
      throw new CliError(
        "INVALID_ARGUMENT",
        `Unknown workitem command: ${command}`,
      );
  }
}

function createClient(
  flags: Flags,
  env: NodeJS.ProcessEnv,
  fetcher?: Fetcher,
): YunxiaoClient {
  return new YunxiaoClient({
    token: stringFlag(flags.token) ?? env.YUNXIAO_TOKEN ?? "",
    domain:
      stringFlag(flags.domain) ??
      env.YUNXIAO_DOMAIN ??
      "openapi-rdc.aliyuncs.com",
    organizationId:
      stringFlag(flags["organization-id"]) ?? env.YUNXIAO_ORGANIZATION_ID,
    edition: (stringFlag(flags.edition) ?? env.YUNXIAO_EDITION) as
      | "center"
      | "region"
      | undefined,
    fetcher,
    timeoutMs: optionalNumber(flags["timeout-ms"]),
    retries: flags.retries === undefined ? undefined : Number(flags.retries),
  });
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
    createdAfter: optionalString(flags["created-after"]),
  };
}

function projectSearchOptions(flags: Flags): SearchProjectsOptions {
  return {
    conditions:
      optionalString(flags.conditions) ??
      projectNameConditions(optionalString(flags.name)),
    extraConditions: optionalString(flags["extra-conditions"]),
    orderBy: optionalString(flags["order-by"]) ?? "gmtCreate",
    page: optionalNumber(flags.page) ?? 1,
    perPage: optionalNumber(flags["per-page"]) ?? 20,
    sort: optionalString(flags.sort) ?? "desc",
  };
}

function pipelineRunsOptions(flags: Flags): ListPipelineRunsOptions {
  return {
    page: optionalNumber(flags.page),
    perPage: optionalNumber(flags["per-page"]),
    startTime: optionalNumber(flags["start-time"]),
    endTime:
      optionalNumber(flags["end-time"]) ?? optionalNumber(flags["end-tme"]),
    status: optionalString(flags.status),
    triggerMode: optionalNumber(flags["trigger-mode"]),
  };
}

function latestFailedPipelineRunsOptions(
  flags: Flags,
): ListLatestFailedPipelineRunsOptions {
  return {
    hours: optionalNumber(flags.hours) ?? 24,
    startTime: optionalNumber(flags["start-time"]),
    endTime:
      optionalNumber(flags["end-time"]) ?? optionalNumber(flags["end-tme"]),
    perPage: optionalNumber(flags["per-page"]) ?? 30,
  };
}

async function searchWorkitems(
  client: YunxiaoClient,
  flags: Flags,
  env: NodeJS.ProcessEnv,
  warn?: (s: string) => void,
): Promise<unknown> {
  const projectIds = workitemProjectIds(flags, env);
  const perPage = optionalNumber(flags["per-page"]) ?? 20;
  const firstPage = optionalNumber(flags.page) ?? 1;
  const results: unknown[] = [];

  for (const projectId of projectIds) {
    const rows = await paginate(
      (page, size) =>
        client.searchWorkitems(
          workitemSearchOptions(flags, projectId, page, size, env),
        ),
      { page: firstPage, perPage, allPages: hasFlag(flags, "all-pages"), warn },
    );
    results.push(...rows.map((row) => addQueryProjectId(row, projectId)));
  }
  if (flags.state && !hasFlag(flags, "all-pages"))
    warn?.(
      "State filtering applies only to fetched pages; use --all-pages for complete results.\n",
    );

  return filterWorkitems(results, flags);
}

function workitemSearchOptions(
  flags: Flags,
  projectId: string,
  page: number,
  perPage: number,
  env: NodeJS.ProcessEnv,
): SearchWorkitemsOptions {
  return {
    category:
      optionalString(flags.category) ??
      env.YUNXIAO_WORKITEM_CATEGORIES ??
      "Req,Task,Bug",
    conditions: workitemConditions(flags),
    orderBy: optionalString(flags["order-by"]) ?? "gmtCreate",
    page,
    perPage,
    sort: optionalString(flags.sort) ?? "desc",
    spaceId: projectId,
    spaceType: optionalString(flags["space-type"]) ?? "Project",
  };
}

function workitemConditions(flags: Flags): string | undefined {
  const rawConditions = optionalString(flags.conditions);
  const filters: Array<Record<string, unknown>> = [];
  const assignedTo =
    optionalString(flags["assigned-to"]) ?? optionalString(flags.assignee);
  const creator =
    optionalString(flags["created-by"]) ?? optionalString(flags.creator);
  const statusIds = optionalString(flags["status-ids"]);
  const subject = optionalString(flags.subject);
  const from =
    optionalString(flags.from) ?? optionalString(flags["created-after"]);
  const to =
    optionalString(flags.to) ?? optionalString(flags["created-before"]);

  if (
    rawConditions &&
    (assignedTo || creator || statusIds || subject || from || to)
  ) {
    throw new CliError(
      "INVALID_ARGUMENT",
      "--conditions cannot be combined with shortcut workitem filters.",
    );
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
      format: "list",
    });
  }
  if (subject) {
    filters.push({
      fieldIdentifier: "subject",
      operator: "CONTAINS",
      value: [subject],
      toValue: null,
      className: "string",
      format: "input",
    });
  }
  if (from || to) {
    filters.push({
      fieldIdentifier: optionalString(flags["date-field"]) ?? "gmtCreate",
      operator: "BETWEEN",
      value: from ? [from] : [],
      toValue: to ?? null,
      className: "dateTime",
      format: "input",
    });
  }

  return filters.length > 0
    ? JSON.stringify({ conditionGroups: [filters] })
    : undefined;
}

function userCondition(
  fieldIdentifier: string,
  value: string[],
): Record<string, unknown> {
  return {
    fieldIdentifier,
    operator: "CONTAINS",
    value,
    toValue: null,
    className: "user",
    format: "list",
  };
}

function workitemUpdateBody(flags: Flags): UpdateWorkitemOptions {
  const body: UpdateWorkitemOptions = {
    ...jsonObjectFlag(flags.fields),
  };

  for (const field of flagStrings(flags.field)) {
    const [key, value] = parseKeyValue(field, "--field");
    body[key] = parseValue(value);
  }

  const assignedTo =
    optionalString(flags["assigned-to"]) ?? optionalString(flags.assignee);
  if (assignedTo) {
    body.assignedTo = assignedTo;
  }

  const participants = optionalString(flags.participants);
  if (participants) {
    body.participants = csvValues(participants);
  }

  const dueDate =
    optionalString(flags["due-date"]) ??
    optionalString(flags["plan-finish-at"]);
  if (dueDate) {
    body[optionalString(flags["due-field"]) ?? "dueDate"] = dueDate;
  }

  if (Object.keys(body).length === 0) {
    throw new CliError(
      "INVALID_ARGUMENT",
      "No workitem fields to update. Use --assigned-to, --participants, --due-date, --fields, or --field.",
    );
  }

  return body;
}

function mergeOptions(flags: Flags): MergeChangeRequestOptions {
  const mergeType = optionalString(flags["merge-type"]) ?? "no-fast-forward";
  if (!mergeTypes.has(mergeType)) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `Invalid --merge-type: ${mergeType}`,
    );
  }

  return {
    mergeMessage: optionalString(flags.message),
    mergeType: mergeType as MergeChangeRequestOptions["mergeType"],
    removeSourceBranch: hasFlag(flags, "remove-source-branch"),
  };
}

function requireConfirmation(flags: Flags): void {
  if (!hasFlag(flags, "yes")) {
    throw new CliError(
      "INVALID_ARGUMENT",
      "This command changes state. Re-run with --yes after you have reviewed the operation.",
    );
  }
}

function outputFormatFromFlags(flags: Flags): OutputFormat {
  const requestedOutput = optionalString(flags.output);
  if (hasFlag(flags, "json") && requestedOutput && requestedOutput !== "json") {
    throw new CliError(
      "INVALID_ARGUMENT",
      "--json cannot be combined with a non-JSON --output.",
    );
  }

  const output = hasFlag(flags, "json") ? "json" : (requestedOutput ?? "table");
  if (!outputFormats.has(output as OutputFormat)) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `Invalid --output: ${output}. Supported formats: table, json.`,
    );
  }

  return output as OutputFormat;
}

function printResult(
  result: unknown,
  outputFormat: OutputFormat,
  stdout: (text: string) => void,
): void {
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

  const normalizedRows = rows.map((row) =>
    isRecord(row) ? row : { value: row },
  );
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
    "gmtCreate",
    "assignedTo",
    "creator",
    "createdBy",
    "userId",
    "userName",
    "roleName",
    "email",
    "sourceBranch",
    "targetBranch",
    "detailUrl",
  ].filter((key) => normalizedRows.some((row) => row[key] !== undefined));
  const keys =
    preferredKeys.length > 0 ? preferredKeys : uniqueKeys(normalizedRows);
  const widths = keys.map((key) =>
    Math.max(
      key.length,
      ...normalizedRows.map((row) => formatCellValue(row[key]).length),
    ),
  );
  const line = (values: string[]) =>
    values.map((value, index) => value.padEnd(widths[index])).join("  ");

  return (
    [
      line(keys),
      line(keys.map((_, index) => "-".repeat(widths[index]))),
      ...normalizedRows.map((row) =>
        line(keys.map((key) => formatCellValue(row[key]))),
      ),
    ].join("\n") + "\n"
  );
}

function uniqueKeys(rows: Array<Record<string, unknown>>): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function formatKeyValueTable(record: Record<string, unknown>): string {
  const rows = Object.entries(record).map(([key, value]) => ({
    key,
    value: formatCellValue(value),
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
    const displayValue =
      value.displayName ??
      value.name ??
      value.userName ??
      value.title ??
      value.id;
    if (displayValue !== undefined) {
      return String(displayValue);
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function parseLocalId(value: string): number {
  const localId = Number(value);
  if (!Number.isSafeInteger(localId) || localId <= 0) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `<localId> must be a positive integer: ${value}`,
    );
  }

  return localId;
}

function requiredPositional(value: string | undefined, name: string): string {
  if (!value) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `Missing required positional argument <${name}>.`,
    );
  }

  return value;
}

function requiredFlag(flags: Flags, name: string): string {
  const value = optionalString(flags[name]);
  if (!value) {
    throw new CliError("INVALID_ARGUMENT", `Missing required flag --${name}.`);
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
          value: [name],
        },
      ],
    ],
  });
}

function workitemProjectIds(flags: Flags, env: NodeJS.ProcessEnv): string[] {
  const value =
    optionalString(flags["project-ids"]) ??
    optionalString(flags["project-id"]) ??
    env.YUNXIAO_PROJECT_IDS;
  if (!value) {
    throw new CliError(
      "INVALID_ARGUMENT",
      "Missing workitem project scope. Set --project-id, --project-ids, or YUNXIAO_PROJECT_IDS.",
    );
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
    if (
      statusName &&
      statusText(row.status, "name") !== statusName &&
      statusText(row.status, "displayName") !== statusName
    ) {
      return false;
    }
    if (state && state !== "all") {
      const expected = workitemStateNames.get(state);
      if (!expected) {
        throw new CliError(
          "INVALID_ARGUMENT",
          `Invalid --state: ${state}. Supported values: todo, doing, in-progress, done, completed, all.`,
        );
      }

      const actualValues = [
        statusText(row.status, "nameEn"),
        statusText(row.status, "name"),
        statusText(row.status, "displayName"),
      ].filter((value): value is string => Boolean(value));
      return actualValues.some((actual) => expected.includes(actual));
    }

    return true;
  });
}

function statusText(
  value: unknown,
  key: "displayName" | "name" | "nameEn",
): string | undefined {
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
    throw new CliError("INVALID_ARGUMENT", "--fields must be a JSON object.");
  }

  return parsed;
}

function parseKeyValue(value: string, flagName: string): [string, string] {
  const separatorIndex = value.indexOf("=");
  if (separatorIndex <= 0) {
    throw new CliError(
      "INVALID_ARGUMENT",
      `${flagName} expects key=value, got: ${value}`,
    );
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

  return flagValues(value).filter(
    (item): item is string => typeof item === "string",
  );
}

function hasFlag(flags: Flags, name: string): boolean {
  const value = flags[name];
  return value === true || (Array.isArray(value) && value.includes(true));
}

function optionalString(value: FlagValue | undefined): string | undefined {
  if (Array.isArray(value)) {
    return [...value]
      .reverse()
      .find((item): item is string => typeof item === "string");
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
    throw new CliError(
      "INVALID_ARGUMENT",
      `Expected a positive integer, got: ${stringValue}`,
    );
  }

  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
