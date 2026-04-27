import assert from "node:assert/strict";
import { test } from "node:test";
import { YunxiaoClient } from "../src/client.js";

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
