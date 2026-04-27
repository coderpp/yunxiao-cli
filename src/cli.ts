import { YunxiaoClient, type Fetcher, type ListChangeRequestsOptions, type MergeChangeRequestOptions } from "./client.js";

export interface CliIo {
  fetcher?: Fetcher;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | boolean>;
}

type OutputFormat = "table" | "json";

const mergeTypes = new Set(["ff-only", "no-fast-forward", "squash", "rebase"]);
const outputFormats = new Set<OutputFormat>(["table", "json"]);

export async function runCli(args = process.argv.slice(2), env = process.env, io: CliIo = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));

  try {
    const parsed = parseArgs(args);
    if (parsed.positionals.length === 0 || parsed.flags.help) {
      stdout(helpText());
      return 0;
    }

    const [scope, command, repositoryId, localIdRaw] = parsed.positionals;
    if (scope !== "mr" || !command) {
      throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
    }

    const outputFormat = outputFormatFromFlags(parsed.flags);
    const client = createClient(parsed.flags, env, io.fetcher);
    let result: unknown;

    if (command === "list") {
      result = await client.listChangeRequests(listOptions(parsed.flags));
      printResult(result, outputFormat, stdout);
      return 0;
    }

    if (!repositoryId || !localIdRaw) {
      throw new Error(`Command mr ${command} requires <repositoryId> and <localId>.`);
    }

    if (command === "release") {
      requireConfirmation(parsed.flags);
      result = await client.releaseByRepositoryName({
        repositoryName: repositoryId,
        sourceBranch: localIdRaw,
        targetBranch: requiredPositional(parsed.positionals[4], "targetBranch"),
        title: optionalString(parsed.flags.title),
        description: optionalString(parsed.flags.description),
        mergeType: mergeOptions(parsed.flags).mergeType
      });
      printResult(result, outputFormat, stdout);
      return 0;
    }

    const localId = parseLocalId(localIdRaw);

    switch (command) {
      case "review":
        result = await client.reviewChangeRequest(repositoryId, localId, {
          reviewComment: optionalString(parsed.flags.comment)
        });
        break;
      case "merge":
        requireConfirmation(parsed.flags);
        result = await client.mergeChangeRequest(repositoryId, localId, mergeOptions(parsed.flags));
        break;
      case "approve-and-merge":
        requireConfirmation(parsed.flags);
        result = await client.approveAndMerge(repositoryId, localId, {
          reviewComment: optionalString(parsed.flags.comment),
          ...mergeOptions(parsed.flags)
        });
        break;
      case "tree":
        result = await client.getChangeRequestTree(repositoryId, localId, {
          fromPatchSetId: requiredFlag(parsed.flags, "from-patch-set-id"),
          toPatchSetId: requiredFlag(parsed.flags, "to-patch-set-id")
        });
        break;
      case "patches":
        result = await client.listChangeRequestPatchSets(repositoryId, localId);
        break;
      default:
        throw new Error(`Unknown mr command: ${command}`);
    }

    printResult(result, outputFormat, stdout);
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function createClient(flags: Record<string, string | boolean>, env: NodeJS.ProcessEnv, fetcher?: Fetcher): YunxiaoClient {
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
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[rawName] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith("--") && !["json", "yes", "remove-source-branch", "help"].includes(rawName)) {
      flags[rawName] = next;
      index += 1;
    } else {
      flags[rawName] = true;
    }
  }

  return { positionals, flags };
}

function listOptions(flags: Record<string, string | boolean>): ListChangeRequestsOptions {
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

function mergeOptions(flags: Record<string, string | boolean>): MergeChangeRequestOptions {
  const mergeType = optionalString(flags["merge-type"]) ?? "no-fast-forward";
  if (!mergeTypes.has(mergeType)) {
    throw new Error(`Invalid --merge-type: ${mergeType}`);
  }

  return {
    mergeMessage: optionalString(flags.message),
    mergeType: mergeType as MergeChangeRequestOptions["mergeType"],
    removeSourceBranch: Boolean(flags["remove-source-branch"])
  };
}

function requireConfirmation(flags: Record<string, string | boolean>): void {
  if (!flags.yes) {
    throw new Error("This command changes repository state. Re-run with --yes after you have reviewed the merge request.");
  }
}

function outputFormatFromFlags(flags: Record<string, string | boolean>): OutputFormat {
  const requestedOutput = optionalString(flags.output);
  if (flags.json && requestedOutput && requestedOutput !== "json") {
    throw new Error("--json cannot be combined with --output table.");
  }

  const output = flags.json ? "json" : requestedOutput ?? "table";
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
  const preferredKeys = ["localId", "projectId", "title", "state", "sourceBranch", "targetBranch", "detailUrl"].filter(
    (key) => normalizedRows.some((row) => row[key] !== undefined)
  );
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

  if (typeof value === "object") {
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

function requiredFlag(flags: Record<string, string | boolean>, name: string): string {
  const value = optionalString(flags[name]);
  if (!value) {
    throw new Error(`Missing required flag --${name}.`);
  }

  return value;
}

function optionalString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringFlag(value: string | boolean | undefined): string | undefined {
  return optionalString(value);
}

function optionalNumber(value: string | boolean | undefined): number | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`Expected a positive integer, got: ${value}`);
  }

  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function helpText(): string {
  return `yunxiao - Yunxiao Codeup merge request helper

Usage:
  yunxiao mr list [--state opened] [--project-ids 2813489] [--output table|json]
  yunxiao mr review <repositoryId> <localId> [--comment "LGTM"] [--output table|json]
  yunxiao mr merge <repositoryId> <localId> --yes [--merge-type no-fast-forward] [--output table|json]
  yunxiao mr approve-and-merge <repositoryId> <localId> --yes [--merge-type no-fast-forward] [--output table|json]
  yunxiao mr release <repositoryName> <sourceBranch> <targetBranch> --yes [--title "Release"] [--output table|json]
  yunxiao mr tree <repositoryId> <localId> --from-patch-set-id <id> --to-patch-set-id <id> [--output table|json]
  yunxiao mr patches <repositoryId> <localId> [--output table|json]

Output:
  --output table             Plain text table output, default
  --output json              Pretty JSON output
  --json                     Alias for --output json

Config:
  YUNXIAO_TOKEN              Personal access token
  YUNXIAO_DOMAIN             API domain, default openapi-rdc.aliyuncs.com
  YUNXIAO_ORGANIZATION_ID    Required for center edition
  YUNXIAO_EDITION            center or region
`;
}
