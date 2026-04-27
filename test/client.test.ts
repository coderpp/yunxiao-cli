import assert from "node:assert/strict";
import { test } from "node:test";
import { YunxiaoApiError, YunxiaoClient } from "../src/client.js";

function createFetchRecorder(response: unknown = { result: true }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  return { calls, fetcher };
}

test("list change requests builds center edition URL with filters", async () => {
  const { calls, fetcher } = createFetchRecorder([]);
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.listChangeRequests({
    page: 2,
    perPage: 10,
    projectIds: "2813489,2813490",
    state: "opened",
    orderBy: "updated_at",
    sort: "desc"
  });

  assert.equal(calls[0].init.method, "GET");
  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/org-1/changeRequests?page=2&perPage=10&projectIds=2813489%2C2813490&state=opened&orderBy=updated_at&sort=desc"
  );
  assert.equal((calls[0].init.headers as Record<string, string>)["x-yunxiao-token"], "pt-test");
});

test("review change request sends PASS opinion to region edition URL", async () => {
  const { calls, fetcher } = createFetchRecorder({ result: true });
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "example.aliyuncs.com",
    edition: "region",
    fetcher
  });

  await client.reviewChangeRequest("group/repo", 12, {
    reviewComment: "LGTM"
  });

  assert.equal(
    calls[0].url,
    "https://example.aliyuncs.com/oapi/v1/codeup/repositories/group%2Frepo/changeRequests/12/review"
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    reviewComment: "LGTM",
    reviewOpinion: "PASS"
  });
});

test("merge change request sends merge options", async () => {
  const { calls, fetcher } = createFetchRecorder({ localId: 12, state: "MERGED" });
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.mergeChangeRequest("2813489", 12, {
    mergeMessage: "merge MR !12",
    mergeType: "squash",
    removeSourceBranch: true
  });

  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/org-1/repositories/2813489/changeRequests/12/merge"
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    mergeMessage: "merge MR !12",
    mergeType: "squash",
    removeSourceBranch: true
  });
});

test("approve and merge reviews before merging", async () => {
  const { calls, fetcher } = createFetchRecorder({ result: true });
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.approveAndMerge("2813489", 12, {
    reviewComment: "approved",
    mergeType: "ff-only"
  });

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/review$/);
  assert.match(calls[1].url, /\/merge$/);
});

test("change tree requires from and to patch set ids", async () => {
  const { calls, fetcher } = createFetchRecorder([]);
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.getChangeRequestTree("2813489", 12, {
    fromPatchSetId: "target-version",
    toPatchSetId: "source-version"
  });

  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/org-1/repositories/2813489/changeRequests/12/diffs/changeTree?fromPatchSetId=target-version&toPatchSetId=source-version"
  );
});

test("list repositories searches by repository name", async () => {
  const { calls, fetcher } = createFetchRecorder([]);
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.listRepositories({
    page: 1,
    perPage: 20,
    search: "yunxiao-cli",
    archived: false
  });

  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/org-1/repositories?page=1&perPage=20&search=yunxiao-cli&archived=false"
  );
});

test("create change request sends reviewer and branch details", async () => {
  const { calls, fetcher } = createFetchRecorder({ localId: 15, projectId: 2813489 });
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  await client.createChangeRequest("2813489", {
    sourceBranch: "release/1.2.3",
    targetBranch: "master",
    sourceProjectId: 2813489,
    targetProjectId: 2813489,
    reviewerUserIds: ["user-1"],
    title: "Release 1.2.3",
    description: "release notes"
  });

  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/codeup/organizations/org-1/repositories/2813489/changeRequests"
  );
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    createFrom: "WEB",
    description: "release notes",
    reviewerUserIds: ["user-1"],
    sourceBranch: "release/1.2.3",
    sourceProjectId: 2813489,
    targetBranch: "master",
    targetProjectId: 2813489,
    title: "Release 1.2.3",
    triggerAIReviewRun: false
  });
});

test("release workflow finds repository, creates change request, approves, and merges without deleting source branch", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const responses = [
    { id: "user-1", name: "Release Owner" },
    [{ id: 2813489, name: "yunxiao-cli", path: "yunxiao-cli", pathWithNamespace: "coderpp/yunxiao-cli" }],
    { localId: 16, projectId: 2813489 },
    { result: true },
    { status: "MERGED" }
  ];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher
  });

  const result = await client.releaseByRepositoryName({
    repositoryName: "yunxiao-cli",
    sourceBranch: "release/1.2.3",
    targetBranch: "master",
    title: "Release 1.2.3"
  });

  assert.deepEqual(result, {
    repository: { id: 2813489, name: "yunxiao-cli", path: "yunxiao-cli", pathWithNamespace: "coderpp/yunxiao-cli" },
    changeRequest: { localId: 16, projectId: 2813489 },
    review: { result: true },
    merge: { status: "MERGED" }
  });
  assert.match(calls[0].url, /\/oapi\/v1\/platform\/user$/);
  assert.match(calls[1].url, /\/repositories\?page=1&perPage=20&search=yunxiao-cli&archived=false$/);
  assert.match(calls[2].url, /\/repositories\/2813489\/changeRequests$/);
  assert.deepEqual(JSON.parse(String(calls[2].init.body)).reviewerUserIds, ["user-1"]);
  assert.match(calls[3].url, /\/repositories\/2813489\/changeRequests\/16\/review$/);
  assert.match(calls[4].url, /\/repositories\/2813489\/changeRequests\/16\/merge$/);
  assert.deepEqual(JSON.parse(String(calls[4].init.body)), {
    mergeType: "no-fast-forward",
    removeSourceBranch: false
  });
});

test("api errors include request method, url, and response body", async () => {
  const client = new YunxiaoClient({
    token: "pt-test",
    domain: "openapi-rdc.aliyuncs.com",
    organizationId: "org-1",
    fetcher: async () =>
      new Response(JSON.stringify({ code: "Forbidden", message: "no permission" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      })
  });

  await assert.rejects(
    () => client.listRepositories({ search: "sjc-web" }),
    (error) => {
      assert.ok(error instanceof YunxiaoApiError);
      assert.equal(error.status, 403);
      assert.equal(error.method, "GET");
      assert.match(error.url, /\/repositories\?search=sjc-web$/);
      assert.match(error.message, /GET https:\/\/openapi-rdc\.aliyuncs\.com/);
      assert.match(error.message, /no permission/);
      return true;
    }
  );
});
