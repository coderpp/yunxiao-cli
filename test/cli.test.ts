import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "../src/cli.js";

test("list command prints JSON when requested", async () => {
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "list", "--json", "--state", "opened"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () =>
        new Response(JSON.stringify([{ localId: 1, title: "Fix bug", state: "UNDER_REVIEW" }]), {
          status: 200,
          headers: { "content-type": "application/json" }
        }),
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => {}
    }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(JSON.parse(stdout), [{ localId: 1, title: "Fix bug", state: "UNDER_REVIEW" }]);
});

test("merge command refuses without confirmation", async () => {
  let stderr = "";
  const exitCode = await runCli(
    ["mr", "merge", "2813489", "1"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () => {
        throw new Error("fetch should not be called");
      },
      stdout: () => {},
      stderr: (text) => {
        stderr += text;
      }
    }
  );

  assert.equal(exitCode, 1);
  assert.match(stderr, /--yes/);
});

test("approve-and-merge command calls API when confirmed", async () => {
  const urls: string[] = [];
  const exitCode = await runCli(
    ["mr", "approve-and-merge", "2813489", "1", "--yes", "--merge-type", "squash"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      },
      stdout: () => {},
      stderr: () => {}
    }
  );

  assert.equal(exitCode, 0);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /\/review$/);
  assert.match(urls[1], /\/merge$/);
});

test("merge command defaults to no-fast-forward", async () => {
  let mergeBody: unknown;
  const exitCode = await runCli(
    ["mr", "merge", "2813489", "1", "--yes"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (_url, init) => {
        mergeBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ result: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      },
      stdout: () => {},
      stderr: () => {}
    }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(mergeBody, {
    mergeType: "no-fast-forward",
    removeSourceBranch: false
  });
});
