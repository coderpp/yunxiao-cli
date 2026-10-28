import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../src/cli.js";
import { YunxiaoClient, type Fetcher } from "../src/client.js";
import { parseArgs, validateArgs } from "../src/arguments.js";
import { CliError } from "../src/errors.js";
import { resolveConfig } from "../src/config.js";
import { paginate } from "../src/pagination.js";
const env = {
  YUNXIAO_TOKEN: "pt-secret",
  YUNXIAO_ORGANIZATION_ID: "org",
  YUNXIAO_CONFIG: "/nonexistent/yunxiao-test.json",
};
const response = (v: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { headers });
async function cli(
  args: string[],
  fetcher: Fetcher = async () => response({}),
  extra: NodeJS.ProcessEnv = {},
) {
  let out = "",
    err = "";
  const calls: Array<{ url: URL; init: RequestInit }> = [];
  const exit = await runCli(
    args,
    { ...env, ...extra },
    {
      stdout: (s) => (out += s),
      stderr: (s) => (err += s),
      stdin: async () => "hello\n世界=a=b",
      fetcher: async (u, i) => {
        calls.push({ url: new URL(String(u)), init: i ?? {} });
        return fetcher(u, i);
      },
    },
  );
  return { exit, out, err, calls };
}
const patches = [
  {
    patchSetBizId: "base",
    commitId: "aaa",
    relatedMergeItemType: "MERGE_TARGET",
    versionNo: 1,
  },
  {
    patchSetBizId: "head",
    commitId: "bbb",
    relatedMergeItemType: "MERGE_SOURCE",
    versionNo: 2,
  },
];
const item = {
  newPath: "a.ts",
  oldPath: "a.ts",
  newObjectId: "new",
  oldObjectId: "old",
  addLines: 1,
  delLines: 1,
  isBinary: false,
};

test("strict arguments reject unknown, missing, extra, invalid and duplicate flags", () => {
  for (const args of [
    ["mr", "list", "--typo", "x"],
    ["mr", "get", "r", "1", "extra"],
    ["mr", "list", "--page", "0"],
    ["mr", "list", "--per-page", "101"],
    ["mr", "list", "--sort", "bad"],
    ["mr", "list", "--state", "bad"],
    ["mr", "list", "--yes=false"],
    ["mr", "list", "--state"],
    ["mr", "list", "--state=a", "--state=b"],
    ["mr", "list", "--json=wat"],
  ])
    assert.throws(() => validateArgs(parseArgs(args)), CliError);
  const p = parseArgs([
    "wi",
    "update",
    "x",
    "--field=a=b=c",
    "--field",
    "d=e",
    "--yes=false",
  ]);
  assert.deepEqual(p.flags.field, ["a=b=c", "d=e"]);
  assert.equal(p.flags.yes, false);
  assert.equal(p.positionals[0], "workitem");
});
test("file input supports stdin without mangling Unicode/newlines/equals and enforces conflicts", async () => {
  const result = await cli([
    "wi",
    "comment",
    "w",
    "--content-file",
    "-",
    "--yes",
    "--json",
  ]);
  assert.equal(result.exit, 0);
  assert.equal(
    JSON.parse(String(result.calls[0].init.body)).content,
    "hello\n世界=a=b",
  );
  const conflict = await cli([
    "wi",
    "comment",
    "w",
    "--content",
    "text",
    "--content-file",
    "-",
    "--yes",
  ]);
  assert.equal(conflict.exit, 2);
  assert.equal(conflict.calls.length, 0);
});
test("structured parse errors and boolean false never perform writes", async () => {
  const bad = await cli([
    "mr",
    "close",
    "r",
    "1",
    "--yes=false",
    "--error-format=json",
  ]);
  assert.equal(bad.exit, 2);
  assert.equal(bad.calls.length, 0);
  assert.equal(JSON.parse(bad.err).error.code, "CONFIRMATION_REQUIRED");
  const parse = await cli(["mr", "list", "--page", "--error-format=json"]);
  assert.equal(parse.exit, 2);
  assert.equal(JSON.parse(parse.err).error.code, "INVALID_ARGUMENT");
});
test("global version and subcommand help require no token", async () => {
  const v = await cli(["--version"]);
  assert.match(v.out, /^\d+\.\d+\.\d+\n$/);
  assert.equal(v.calls.length, 0);
  const h = await cli(["mr", "diff", "--help"]);
  assert.match(h.out, /--from-patch-set-id/);
  assert.doesNotMatch(h.out, /pipeline start/);
});
test("all pages follows server headers even with a short server-clamped page", async () => {
  let n = 0;
  const result = await cli(["mr", "list", "--all-pages", "--json"], async () =>
    response([{ localId: ++n }], {
      "x-next-page": n === 1 ? "2" : "",
      "x-per-page": "1",
    }),
  );
  assert.equal(result.exit, 0);
  assert.deepEqual(JSON.parse(result.out), [{ localId: 1 }, { localId: 2 }]);
  assert.equal(result.calls[1].url.searchParams.get("page"), "2");
});
test("single-page warning stays off JSON stdout", async () => {
  const r = await cli(["member", "list", "--json"], async () =>
    response([{ id: 1 }], { "x-next-page": "2" }),
  );
  assert.equal(r.exit, 0);
  assert.deepEqual(JSON.parse(r.out), [{ id: 1 }]);
  assert.match(r.err, /all-pages/);
});
test("pagination detects duplicate pages and does not output partial results", async () => {
  const r = await cli(
    ["project", "list", "--all-pages", "--per-page", "1", "--json"],
    async () => response([{ id: 1 }]),
  );
  assert.equal(r.exit, 6);
  assert.equal(r.out, "");
  assert.match(r.err, /repeated page/);
  await assert.rejects(
    paginate(async () => ({ items: [] })),
    /array/,
  );
});
test("read-only POST retries 503 but writes do not replay", async () => {
  let reads = 0;
  const c = new YunxiaoClient({
    token: "test",
    retries: 1,
    fetcher: async () =>
      ++reads === 1 ? new Response("", { status: 503 }) : response([]),
  });
  assert.deepEqual(await c.searchProjects(), []);
  assert.equal(reads, 2);
  let writes = 0;
  const w = new YunxiaoClient({
    token: "test",
    fetcher: async () => {
      writes++;
      return new Response("", { status: 503 });
    },
  });
  await assert.rejects(
    w.createWorkitemComment("w", { content: "x" }),
    (e: unknown) => e instanceof CliError && e.code === "WRITE_RESULT_UNKNOWN",
  );
  assert.equal(writes, 1);
});
test("429 respects retry-after policy and exhausted reads retain request ID", async () => {
  let calls = 0;
  const c = new YunxiaoClient({
    token: "test",
    fetcher: async () => {
      calls++;
      return new Response("{}", {
        status: 429,
        headers: { "retry-after": "120" },
      });
    },
  });
  await assert.rejects(
    c.getCurrentUser(),
    (e: unknown) => e instanceof CliError && e.code === "RATE_LIMITED",
  );
  assert.equal(calls, 1);
  const r = await cli(
    ["auth", "whoami", "--retries", "0", "--error-format=json"],
    async () =>
      new Response('{"code":"LIMIT"}', {
        status: 429,
        headers: { "x-request-id": "req" },
      }),
  );
  assert.equal(r.exit, 6);
  assert.equal(JSON.parse(r.err).error.requestId, "req");
});
test("timeout covers body reads and classifies unknown writes", async () => {
  const hanging: Fetcher = async () =>
    new Response(new ReadableStream({ start() {} }));
  const c = new YunxiaoClient({
    token: "test",
    timeoutMs: 10,
    retries: 0,
    fetcher: hanging,
  });
  await assert.rejects(
    c.getCurrentUser(),
    (e: unknown) => e instanceof CliError && e.code === "TIMEOUT",
  );
  await assert.rejects(
    c.createWorkitemComment("w", { content: "x" }),
    (e: unknown) => e instanceof CliError && e.exitCode === 7,
  );
});
test("error output redacts credentials and signed URLs while preserving classification", async () => {
  const r = await cli(
    ["auth", "whoami", "--error-format=json"],
    async () =>
      new Response("pt-secret https://storage.test/file?signature=abc", {
        status: 403,
      }),
  );
  assert.equal(r.exit, 3);
  assert.doesNotMatch(r.err, /pt-secret|signature=abc/);
  assert.equal(r.out, "");
});
test("profiles persist only references, precedence works, and show does not need credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yx-config-"));
  const file = join(dir, "config.json");
  try {
    let r = await cli([
      "config",
      "set",
      "dev",
      "--config",
      file,
      "--token-env",
      "DEV_TOKEN",
      "--organization-id",
      "profile-org",
      "--edition",
      "center",
    ]);
    assert.equal(r.exit, 0);
    r = await cli(["config", "use", "dev", "--config", file]);
    assert.equal(r.exit, 0);
    const resolved = await resolveConfig(
      { config: file },
      { DEV_TOKEN: "secret" },
    );
    assert.equal(resolved.YUNXIAO_TOKEN, "secret");
    assert.equal(resolved.YUNXIAO_ORGANIZATION_ID, "profile-org");
    assert.equal(
      (
        await resolveConfig(
          { config: file },
          { DEV_TOKEN: "secret", YUNXIAO_TOKEN: "override" },
        )
      ).YUNXIAO_TOKEN,
      "override",
    );
    r = await cli(["config", "show", "--config", file, "--json"]);
    assert.equal(r.exit, 0);
    assert.equal(JSON.parse(r.out)["token-env"], "DEV_TOKEN");
    assert.doesNotMatch(await readFile(file, "utf8"), /pt-secret|"token":/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    r = await cli([
      "config",
      "set",
      "x",
      "--config",
      file,
      "--token",
      "secret",
    ]);
    assert.equal(r.exit, 2);
    await writeFile(file, '{"profiles":{"x":{"token":"secret"}}}');
    assert.equal((await cli(["config", "list", "--config", file])).exit, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("MR CRUD, refusal and comments use verified routes and preserve empty descriptions", async () => {
  let r = await cli(
    [
      "mr",
      "create",
      "org/repo",
      "--source",
      "dev",
      "--target",
      "main",
      "--title",
      "T",
      "--reviewers",
      "u1,u2",
      "--yes",
      "--json",
    ],
    async (u) =>
      response(
        String(u).endsWith("/changeRequests") ? { localId: 2 } : { id: 7 },
      ),
  );
  assert.equal(r.exit, 0);
  assert.match(r.calls[0].url.pathname, /org%2Frepo$/);
  const body = JSON.parse(String(r.calls[1].init.body));
  assert.equal(body.targetProjectId, 7);
  assert.deepEqual(body.reviewerUserIds, ["u1", "u2"]);
  r = await cli(
    ["mr", "update", "7", "2", "--description=", "--yes"],
    async () => response({ result: true }),
  );
  assert.equal(r.exit, 0);
  assert.deepEqual(JSON.parse(String(r.calls[0].init.body)), {
    description: "",
  });
  r = await cli(["mr", "review", "7", "2", "--opinion", "not-pass"]);
  assert.equal(
    JSON.parse(String(r.calls[0].init.body)).reviewOpinion,
    "NOT_PASS",
  );
  r = await cli(
    ["mr", "comments", "7", "2", "--resolved=false", "--file", "a.ts"],
    async () => response([]),
  );
  assert.equal(r.calls[0].init.method, "POST");
  assert.match(r.calls[0].url.pathname, /comments\/list$/);
  assert.deepEqual(JSON.parse(String(r.calls[0].init.body)), {
    file_path: "a.ts",
    resolved: false,
  });
});
test("MR comment binds explicit patch pair and side; normal comments resolve latest source", async () => {
  const fetcher: Fetcher = async (u) =>
    response(
      String(u).endsWith("/patches")
        ? patches
        : String(u).includes("/changeTree")
          ? { changedTreeItems: [item] }
          : { id: "c" },
    );
  let r = await cli(
    [
      "mr",
      "comment",
      "r",
      "1",
      "--file",
      "a.ts",
      "--line",
      "2",
      "--side",
      "old",
      "--to-patch-set-id",
      "head",
      "--content",
      "check",
      "--yes",
    ],
    fetcher,
  );
  assert.equal(r.exit, 0);
  const body = JSON.parse(String(r.calls.at(-1)!.init.body));
  assert.equal(body.patchset_biz_id, "base");
  assert.equal(body.to_patchset_biz_id, "head");
  assert.equal(body.comment_type, "INLINE_COMMENT");
  r = await cli(
    [
      "mr",
      "comment",
      "r",
      "1",
      "--content",
      "reply",
      "--parent-id",
      "parent",
      "--yes",
    ],
    fetcher,
  );
  assert.equal(r.exit, 0);
  assert.equal(
    JSON.parse(String(r.calls.at(-1)!.init.body)).parent_comment_biz_id,
    "parent",
  );
  r = await cli(
    [
      "mr",
      "comment",
      "r",
      "1",
      "--file",
      "missing",
      "--line",
      "2",
      "--side",
      "new",
      "--to-patch-set-id",
      "head",
      "--content",
      "check",
      "--yes",
    ],
    fetcher,
  );
  assert.equal(r.exit, 4);
  assert.ok(r.calls.every((c) => c.init.method === "GET"));
});
test("diff pins SHAs and validates tree counts, binary and truncated content", async () => {
  let truncated = false;
  const f: Fetcher = async (u) =>
    response(
      String(u).endsWith("/patches")
        ? patches
        : String(u).includes("/changeTree")
          ? { changedTreeItems: [item], count: 1 }
          : {
              diffs: [
                {
                  newPath: "a.ts",
                  oldPath: "a.ts",
                  newId: "new",
                  oldId: "old",
                  diff: truncated
                    ? ""
                    : "--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new",
                },
              ],
            },
    );
  let r = await cli(["mr", "diff", "r", "1", "--json"], f);
  assert.equal(r.exit, 0);
  assert.equal(JSON.parse(r.out).complete, true);
  assert.equal(r.calls.at(-1)!.url.searchParams.get("from"), "aaa");
  assert.equal(r.calls.at(-1)!.url.searchParams.get("straight"), "false");
  truncated = true;
  r = await cli(["mr", "diff", "r", "1", "--json"], f);
  assert.equal(JSON.parse(r.out).complete, false);
});
test("pipeline start wraps JSON params; jobs/logs/cancel expose run state", async () => {
  let r = await cli(
    [
      "pipeline",
      "start",
      "p",
      '--params={"envs":{"a":"b=c"}}',
      "--yes",
      "--json",
    ],
    async () => response(8),
  );
  assert.equal(JSON.parse(r.out).pipelineRunId, 8);
  assert.deepEqual(
    JSON.parse(JSON.parse(String(r.calls[0].init.body)).params),
    { envs: { a: "b=c" } },
  );
  r = await cli(["pipeline", "jobs", "p", "8", "--json"], async () =>
    response({
      stages: [
        { name: "build", stageInfo: { jobs: [{ id: 9, status: "FAIL" }] } },
      ],
    }),
  );
  assert.equal(JSON.parse(r.out)[0].stageName, "build");
  r = await cli(["pl", "logs", "p", "8", "9", "--output=text"], async () =>
    response({ content: "log\n", last: 1, more: true }),
  );
  assert.equal(r.out, "log\n");
  assert.match(r.err, /snapshot/);
  r = await cli(["pl", "cancel", "p", "8", "--yes", "--json"], async (_u, i) =>
    response(i?.method === "PUT" ? true : { status: "CANCELED" }),
  );
  assert.equal(r.calls.length, 2);
  assert.equal(JSON.parse(r.out).run.status, "CANCELED");
});
test("new API methods support both center and region paths", async () => {
  for (const organizationId of [undefined, "org"]) {
    const calls: string[] = [];
    const c = new YunxiaoClient({
      token: "t",
      organizationId,
      fetcher: async (u) => {
        calls.push(String(u));
        return response({});
      },
    });
    await c.getChangeRequest("r", 1);
    await c.closeChangeRequest("r", 1);
    await c.getPipelineJobLog("p", "2", "3");
    await c.startPipeline("p");
    await c.cancelPipeline("p", "2");
    for (const u of calls)
      assert.equal(u.includes("/organizations/org/"), !!organizationId);
  }
});

test("release recovery preserves explicit profile context without including credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "yx-resume-"));
  const config = join(dir, "config.json");
  try {
    await writeFile(
      config,
      JSON.stringify({ profiles: { dev: { "token-env": "YUNXIAO_TOKEN" } } }),
    );
    const r = await cli(
      [
        "mr",
        "release",
        "app",
        "dev",
        "main",
        "--yes",
        "--config",
        config,
        "--profile",
        "dev",
        "--organization-id",
        "org2",
        "--error-format=json",
      ],
      async (u) => {
        return response(
          new URL(String(u)).pathname.endsWith("/repositories")
            ? [{ id: 1, name: "app" }]
            : [
                {
                  localId: 9,
                  sourceProjectId: 1,
                  projectId: 1,
                  sourceBranch: "dev",
                  targetBranch: "main",
                },
              ],
        );
      },
    );
    assert.equal(r.exit, 5);
    const args = JSON.parse(r.err).error.details.resumeArgs;
    assert.deepEqual(args.slice(-6), [
      "--config",
      config,
      "--profile",
      "dev",
      "--organization-id",
      "org2",
    ]);
    assert.doesNotMatch(r.err, /pt-secret/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
