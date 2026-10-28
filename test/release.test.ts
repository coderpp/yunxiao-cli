import assert from "node:assert/strict";
import { test } from "node:test";
import { YunxiaoClient } from "../src/client.js";
import { CliError } from "../src/errors.js";
const repo = { id: 1, name: "app", pathWithNamespace: "team/app" };
const mr = {
  localId: 9,
  sourceProjectId: 1,
  targetProjectId: 1,
  sourceBranch: "dev",
  targetBranch: "main",
  status: "UNDER_REVIEW",
  detailUrl: "https://codeup.aliyun.com/team/app/change/9",
};
const patch = {
  patchSetBizId: "v1",
  commitId: "sha1",
  relatedMergeItemType: "MERGE_SOURCE",
  versionNo: 1,
  createTime: "2026-10-01T00:00:00Z",
};
const options = {
  repositoryName: "app",
  sourceBranch: "dev",
  targetBranch: "main",
};
function fixture(
  overrides: {
    existing?: unknown[];
    create?: () => Response;
    get?: () => unknown;
    patches?: () => unknown;
    review?: () => Response;
    merge?: () => Response;
  } = {},
) {
  const calls: Array<{ path: string; method: string }> = [];
  const c = new YunxiaoClient({
    token: "test",
    retries: 0,
    fetcher: async (u, i) => {
      const path = new URL(String(u)).pathname;
      const method = i?.method ?? "GET";
      calls.push({ path, method });
      const response = (v: unknown) => new Response(JSON.stringify(v));
      if (path.endsWith("/repositories")) return response([repo]);
      if (path.endsWith("/platform/user")) return response({ id: "me" });
      if (path.endsWith("/patches"))
        return response(overrides.patches?.() ?? [patch]);
      if (path.endsWith("/review"))
        return overrides.review?.() ?? response({ result: true });
      if (path.endsWith("/merge"))
        return overrides.merge?.() ?? response({ status: "MERGED" });
      if (path.endsWith("/changeRequests/9"))
        return response(overrides.get?.() ?? mr);
      if (path.endsWith("/changeRequests") && method === "GET")
        return response(overrides.existing ?? []);
      if (path.endsWith("/changeRequests") && method === "POST")
        return overrides.create?.() ?? response(mr);
      throw Error(`Unexpected ${method} ${path}`);
    },
  });
  return { c, calls };
}
test("release refuses existing MR and returns explicit recovery arguments without writes", async () => {
  const { c, calls } = fixture({ existing: [mr] });
  await assert.rejects(c.releaseByRepositoryName(options), (e: unknown) => {
    assert.ok(e instanceof CliError);
    assert.equal(e.code, "EXISTING_MR");
    assert.deepEqual((e.details as { resumeArgs: string[] }).resumeArgs, [
      "mr",
      "release",
      "app",
      "dev",
      "main",
      "--resume",
      "9",
      "--yes",
    ]);
    return true;
  });
  assert.ok(calls.every((c) => c.method === "GET"));
});
test("resume merged is idempotent and closed/mismatched MRs are rejected", async () => {
  for (const status of ["MERGED", "CLOSED"]) {
    const { c, calls } = fixture({ get: () => ({ ...mr, status }) });
    if (status === "MERGED")
      assert.equal(
        (await c.releaseByRepositoryName({ ...options, resume: 9 })).status,
        "already-merged",
      );
    else
      await assert.rejects(
        c.releaseByRepositoryName({ ...options, resume: 9 }),
        /closed/,
      );
    assert.ok(calls.every((c) => c.method === "GET"));
  }
  const { c } = fixture({ get: () => ({ ...mr, sourceBranch: "other" }) });
  await assert.rejects(
    c.releaseByRepositoryName({ ...options, resume: 9 }),
    /does not match/,
  );
});
test("resume skips approval only when current user reviewed the current version", async () => {
  const { c, calls } = fixture({
    get: () => ({
      ...mr,
      reviewers: [
        {
          userId: "me",
          reviewOpinionStatus: "PASS",
          reviewTime: "2026-10-02T00:00:00Z",
        },
      ],
    }),
  });
  assert.equal(
    (await c.releaseByRepositoryName({ ...options, resume: 9 })).status,
    "merged",
  );
  assert.ok(!calls.some((c) => c.path.endsWith("/review")));
  assert.equal(calls.filter((c) => c.path.endsWith("/merge")).length, 1);
  const stale = fixture({
    get: () => ({
      ...mr,
      reviewers: [
        {
          userId: "me",
          reviewOpinionStatus: "PASS",
          reviewTime: "2026-09-01T00:00:00Z",
        },
      ],
    }),
  });
  await stale.c.releaseByRepositoryName({ ...options, resume: 9 });
  assert.equal(stale.calls.filter((c) => c.path.endsWith("/review")).length, 1);
});
test("version changes during approval stop merge and preserve stage result", async () => {
  let n = 0;
  const { c, calls } = fixture({
    patches: () => [{ ...patch, commitId: ++n === 1 ? "sha1" : "sha2" }],
  });
  await assert.rejects(c.releaseByRepositoryName(options), (e: unknown) => {
    assert.ok(e instanceof CliError);
    assert.equal(e.exitCode, 7);
    assert.deepEqual((e.details as { completed: string[] }).completed, [
      "create",
      "review",
    ]);
    return true;
  });
  assert.ok(!calls.some((c) => c.path.endsWith("/merge")));
});
test("merge response lost is reconciled from server without replaying the write", async () => {
  const { c, calls } = fixture({
    merge: () => {
      throw new TypeError("network");
    },
    get: () => ({ ...mr, status: "MERGED" }),
  });
  assert.equal((await c.releaseByRepositoryName(options)).status, "merged");
  assert.equal(calls.filter((c) => c.path.endsWith("/merge")).length, 1);
});
test("unknown create result looks up existing MR but never proceeds to review", async () => {
  const f = fixture({
    create: () => {
      throw new TypeError("network");
    },
  });
  await assert.rejects(f.c.releaseByRepositoryName(options), (e: unknown) => {
    assert.ok(e instanceof CliError);
    assert.equal(e.code, "WRITE_RESULT_UNKNOWN");
    assert.ok(e.details);
    return true;
  });
  assert.equal(f.calls.filter((c) => c.method === "POST").length, 1);
  assert.equal(
    f.calls.filter(
      (c) => c.path.endsWith("/changeRequests") && c.method === "GET",
    ).length,
    2,
  );
});
test("exact no-change response skips; other validation failures propagate", async () => {
  const no = fixture({
    create: () =>
      new Response("源分支相对目标分支没有改动，不能新建代码评审", {
        status: 400,
      }),
  });
  assert.equal((await no.c.releaseByRepositoryName(options)).status, "skipped");
  const bad = fixture({
    create: () => new Response("branch not found", { status: 400 }),
  });
  await assert.rejects(
    bad.c.releaseByRepositoryName(options),
    /branch not found/,
  );
});
test("review failure returns created MR and recovery details", async () => {
  const { c, calls } = fixture({
    review: () => new Response("denied", { status: 403 }),
  });
  await assert.rejects(c.releaseByRepositoryName(options), (e: unknown) => {
    assert.ok(e instanceof CliError);
    assert.equal(e.exitCode, 7);
    assert.equal((e.details as { localId: number }).localId, 9);
    return true;
  });
  assert.ok(!calls.some((c) => c.path.endsWith("/merge")));
});

test("list response projectId is recognized as the target repository", async () => {
  const { targetProjectId, ...listed } = mr;
  const { c, calls } = fixture({
    existing: [{ ...listed, projectId: targetProjectId }],
  });
  await assert.rejects(
    c.releaseByRepositoryName(options),
    (e: unknown) => e instanceof CliError && e.code === "EXISTING_MR",
  );
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("recovery arguments preserve create-only and merge strategy", async () => {
  const { c } = fixture({ existing: [mr] });
  await assert.rejects(
    c.releaseByRepositoryName({
      ...options,
      createOnly: true,
      mergeType: "squash",
    }),
    (e: unknown) => {
      assert.ok(e instanceof CliError);
      const args = (e.details as { resumeArgs: string[] }).resumeArgs;
      assert.ok(args.includes("--create-only"));
      assert.deepEqual(args.slice(-2), ["--merge-type", "squash"]);
      return true;
    },
  );
});

test("server errors on merge retain recovery details and request diagnostics", async () => {
  const { c } = fixture({
    merge: () =>
      new Response("{}", {
        status: 503,
        headers: { "x-request-id": "merge-request" },
      }),
  });
  await assert.rejects(c.releaseByRepositoryName(options), (e: unknown) => {
    assert.ok(e instanceof CliError);
    assert.equal(e.code, "WRITE_RESULT_UNKNOWN");
    const details = e.details as {
      localId: number;
      failedStage: string;
      cause: { requestId: string };
    };
    assert.equal(details.localId, 9);
    assert.equal(details.failedStage, "merge");
    assert.equal(details.cause.requestId, "merge-request");
    return true;
  });
});

test("successful create with malformed response is unknown, reconciled and never blindly replayed", async () => {
  for (const value of [null, {}, { localId: "invalid" }]) {
    const { c, calls } = fixture({
      create: () => new Response(JSON.stringify(value)),
    });
    await assert.rejects(c.releaseByRepositoryName(options), (e: unknown) => {
      assert.ok(e instanceof CliError);
      assert.equal(e.code, "WRITE_RESULT_UNKNOWN");
      assert.equal(e.exitCode, 7);
      assert.equal(
        (e.details as { resumeArgs?: string[] }).resumeArgs,
        undefined,
      );
      return true;
    });
    assert.equal(calls.filter((c) => c.method === "POST").length, 1);
    assert.equal(
      calls.filter(
        (c) => c.method === "GET" && c.path.endsWith("/changeRequests"),
      ).length,
      2,
    );
  }
});
