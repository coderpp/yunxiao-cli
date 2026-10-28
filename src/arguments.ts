import { readFile } from "node:fs/promises";
import { CliError } from "./errors.js";
export type FlagValue = string | boolean | Array<string | boolean>;
export type Flags = Record<string, FlagValue>;
export type ParsedArgs = { positionals: string[]; flags: Flags };
const globals =
  "token domain organization-id edition profile config timeout-ms retries output json error-format help version";
const pages = "page per-page all-pages";
const merge = "yes merge-type message remove-source-branch";
const workSearch = `${pages} project-id project-ids category assigned-to assignee created-by creator state status-ids status-name status-name-en subject created-after created-before from to date-field conditions order-by sort space-type`;
export const specs: Record<string, [number, string]> = {
  "mr list": [
    0,
    `${pages} state project-ids author-ids reviewer-ids search order-by sort created-before created-after`,
  ],
  "mr get": [2, ""],
  "mr patches": [2, ""],
  "mr tree": [2, "from-patch-set-id to-patch-set-id"],
  "mr diff": [2, "file from-patch-set-id to-patch-set-id"],
  "mr comments": [2, "file comment-type resolved patch-set-ids"],
  "mr comment": [
    2,
    "yes content content-file file line side from-patch-set-id to-patch-set-id parent-id",
  ],
  "mr create": [
    1,
    "yes source target title description description-file reviewers source-project-id",
  ],
  "mr update": [2, "yes title description description-file"],
  "mr close": [2, "yes"],
  "mr review": [2, "comment comment-file opinion"],
  "mr merge": [2, merge],
  "mr approve-and-merge": [2, `${merge} comment comment-file`],
  "mr release": [
    3,
    "yes create-only title description description-file merge-type resume",
  ],
  "project list": [
    0,
    `${pages} name conditions extra-conditions order-by sort`,
  ],
  "project get": [1, ""],
  "project members": [1, "name role-id"],
  "project member-add": [1, "yes user-ids role-id operator-id"],
  "project member-remove": [1, "yes user-ids role-id operator-id"],
  "member list": [0, pages],
  "member get": [1, ""],
  "pipeline list": [
    0,
    `${pages} name status create-start-time create-end-time start-time end-time`,
  ],
  "pipeline runs": [
    1,
    `${pages} status start-time end-time end-tme trigger-mode`,
  ],
  "pipeline failed-runs": [0, "hours start-time end-time end-tme per-page"],
  "pipeline run": [2, ""],
  "pipeline jobs": [2, ""],
  "pipeline logs": [3, ""],
  "pipeline start": [1, "yes params params-file"],
  "pipeline cancel": [2, "yes"],
  "pipeline retry-job": [3, "yes"],
  "workitem list": [0, workSearch],
  "workitem mine": [0, workSearch],
  "workitem get": [1, ""],
  "workitem activities": [1, ""],
  "workitem comments": [1, ""],
  "workitem timeline": [1, ""],
  "workitem content": [1, "dir project-id project-ids download-attachments"],
  "workitem images": [1, "dir"],
  "workitem attachments": [1, "dir"],
  "workitem comment": [1, "yes content content-file parent-id operator-id"],
  "workitem update": [
    1,
    "yes fields field assigned-to assignee participants due-date plan-finish-at due-field",
  ],
  "auth whoami": [0, ""],
  doctor: [0, "remote"],
  "config list": [0, ""],
  "config show": [0, ""],
  "config use": [1, ""],
  "config set": [1, "token-env project-ids category"],
};
const booleans = new Set(
  "yes json help version all-pages create-only remove-source-branch download-attachments remote resolved".split(
    " ",
  ),
);
const aliases: Record<string, string> = {
  "project search": "project list",
  "project add-member": "project member-add",
  "project remove-member": "project member-remove",
  "pipeline list-runs": "pipeline runs",
  "pipeline get-run": "pipeline run",
  "pipeline get": "pipeline run",
  "pipeline retry": "pipeline retry-job",
  "pipeline failed": "pipeline failed-runs",
  "pipeline latest-failed-runs": "pipeline failed-runs",
  "workitem search": "workitem list",
  "workitem comment-create": "workitem comment",
  "workitem history": "workitem timeline",
};
export function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    const name = arg.slice(2, equal < 0 ? undefined : equal);
    let value: string | boolean;
    if (booleans.has(name)) {
      const raw = equal < 0 ? undefined : arg.slice(equal + 1);
      if (raw !== undefined && raw !== "true" && raw !== "false")
        throw new CliError(
          "INVALID_ARGUMENT",
          `--${name} expects true or false.`,
        );
      value = raw !== "false";
    } else {
      if (equal >= 0) value = arg.slice(equal + 1);
      else {
        if (!args[i + 1] || args[i + 1].startsWith("--"))
          throw new CliError("INVALID_ARGUMENT", `--${name} requires a value.`);
        value = args[++i];
      }
    }
    if (flags[name] !== undefined && name !== "field")
      throw new CliError("INVALID_ARGUMENT", `Duplicate --${name}.`);
    flags[name] =
      name === "field" && flags[name] !== undefined
        ? [...(Array.isArray(flags[name]) ? flags[name] : [flags[name]]), value]
        : value;
  }
  if (positionals[0] === "pl") positionals[0] = "pipeline";
  if (positionals[0] === "wi") positionals[0] = "workitem";
  const alias = aliases[positionals.slice(0, 2).join(" ")];
  if (alias) positionals.splice(0, 2, ...alias.split(" "));
  return { positionals, flags };
}
export function validateArgs(parsed: ParsedArgs): void {
  const { positionals: p, flags: f } = parsed;
  const key = p[0] === "doctor" ? "doctor" : p.slice(0, 2).join(" ");
  const spec = specs[key];
  if (!spec) throw new CliError("INVALID_ARGUMENT", `Unknown command: ${key}`);
  const allowed = new Set(`${globals} ${spec[1]}`.split(" "));
  for (const name of Object.keys(f))
    if (!allowed.has(name))
      throw new CliError(
        "INVALID_ARGUMENT",
        `Unknown option --${name} for ${key}.`,
      );
  const expected = (key === "doctor" ? 1 : 2) + spec[0];
  if (p.length !== expected)
    throw new CliError(
      "INVALID_ARGUMENT",
      `${key} requires ${spec[0]} positional argument(s).`,
    );
  for (const name of [
    "page",
    "per-page",
    "timeout-ms",
    "hours",
    "start-time",
    "end-time",
    "end-tme",
    "create-start-time",
    "create-end-time",
    "trigger-mode",
    "line",
    "resume",
    "retries",
  ])
    if (f[name] !== undefined) {
      const n = Number(f[name]);
      if (
        !Number.isSafeInteger(n) ||
        n < (name === "retries" ? 0 : 1) ||
        (name === "per-page" && n > 100) ||
        (name === "retries" && n > 10)
      )
        throw new CliError("INVALID_ARGUMENT", `Invalid --${name}: ${f[name]}`);
    }
  for (const [name, values] of Object.entries({
    edition: ["center", "region"],
    sort: ["asc", "desc"],
    opinion: ["pass", "not-pass"],
    side: ["old", "new"],
    output: ["table", "json", "text"],
    "error-format": ["text", "json"],
    "merge-type": ["ff-only", "no-fast-forward", "squash", "rebase"],
    "comment-type": ["GLOBAL_COMMENT", "INLINE_COMMENT"],
  }))
    if (f[name] !== undefined && !values.includes(String(f[name])))
      throw new CliError("INVALID_ARGUMENT", `Invalid --${name}: ${f[name]}`);
  if (
    key === "mr list" &&
    f.state !== undefined &&
    !["opened", "merged", "closed"].includes(String(f.state))
  )
    throw new CliError("INVALID_ARGUMENT", "Invalid --state.");
  if (
    key.startsWith("workitem ") &&
    f.state !== undefined &&
    !["todo", "opened", "doing", "in-progress", "done", "completed"].includes(
      String(f.state),
    )
  )
    throw new CliError("INVALID_ARGUMENT", "Invalid --state.");
  if (
    key === "mr comment" &&
    f.file !== undefined &&
    (!f.line || !f.side || !f["to-patch-set-id"])
  )
    throw new CliError(
      "INVALID_ARGUMENT",
      "Inline comments require --file, --line, --side and --to-patch-set-id.",
    );
  for (const [start, end] of [
    ["start-time", "end-time"],
    ["create-start-time", "create-end-time"],
  ])
    if (
      f[start] !== undefined &&
      f[end] !== undefined &&
      Number(f[start]) > Number(f[end])
    )
      throw new CliError(
        "INVALID_ARGUMENT",
        `--${start} must not exceed --${end}.`,
      );
  if (f.output === "text" && !["mr diff", "pipeline logs"].includes(key))
    throw new CliError(
      "INVALID_ARGUMENT",
      "--output text is only supported for mr diff and pipeline logs.",
    );
}
export async function loadFileFlags(
  flags: Flags,
  stdin?: () => Promise<string>,
): Promise<void> {
  let usedStdin = false;
  for (const name of ["description", "content", "comment", "params"])
    if (flags[`${name}-file`] !== undefined) {
      if (flags[name] !== undefined)
        throw new CliError(
          "INVALID_ARGUMENT",
          `--${name} and --${name}-file are mutually exclusive.`,
        );
      const file = String(flags[`${name}-file`]);
      if (file === "-" && usedStdin)
        throw new CliError("INVALID_ARGUMENT", "stdin may only be read once.");
      try {
        flags[name] =
          file === "-"
            ? await (stdin
                ? stdin()
                : new Promise<string>((resolve, reject) => {
                    let text = "";
                    process.stdin.setEncoding("utf8");
                    process.stdin.on("data", (chunk) => (text += chunk));
                    process.stdin.on("end", () => resolve(text));
                    process.stdin.on("error", reject);
                  }))
            : await readFile(file, "utf8");
      } catch {
        throw new CliError(
          "INVALID_ARGUMENT",
          `Unable to read --${name}-file.`,
        );
      }
      if (file === "-") usedStdin = true;
    }
}
export function commandHelp(p: string[]): string {
  const prefix = p.join(" ");
  function positionalNames(key: string, count: number): string[] {
    const [scope, command] = key.split(" ");
    if (!count) return [];
    if (scope === "mr")
      return command === "release"
        ? ["repositoryName", "sourceBranch", "targetBranch"]
        : ["repositoryId", "localId"].slice(0, count);
    if (scope === "pipeline")
      return ["pipelineId", "pipelineRunId", "jobId"].slice(0, count);
    if (scope === "project") return ["projectId"];
    if (scope === "member") return ["memberId"];
    if (scope === "config") return ["profileName"];
    return [command === "content" ? "workitemUrl" : "workitemId"];
  }
  const formatFlag = (flag: string) =>
    `--${flag}${booleans.has(flag) ? "" : " <value>"}`;
  return (
    Object.entries(specs)
      .filter(
        ([key]) => !prefix || key === prefix || key.startsWith(prefix + " "),
      )
      .map(
        ([key, [count, flags]]) =>
          `yunxiao ${key}${positionalNames(key, count)
            .map((name) => ` <${name}>`)
            .join(
              "",
            )}\n  ${flags.split(" ").filter(Boolean).map(formatFlag).join(" ")}\n`,
      )
      .join("\n") +
    `\nGlobal: ${globals.split(" ").map(formatFlag).join(" ")}\n`
  );
}
