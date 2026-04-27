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

test("list command prints JSON with output option", async () => {
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "list", "--output", "json", "--state", "opened"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () =>
        new Response(JSON.stringify([{ localId: 2, title: "Add output", state: "UNDER_REVIEW" }]), {
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
  assert.deepEqual(JSON.parse(stdout), [{ localId: 2, title: "Add output", state: "UNDER_REVIEW" }]);
});

test("list command prints table by default", async () => {
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "list"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () =>
        new Response(JSON.stringify([{ localId: 3, title: "Table output", state: "OPENED" }]), {
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
  assert.match(stdout, /localId\s+title\s+state/);
  assert.match(stdout, /3\s+Table output\s+OPENED/);
});

test("review command prints object as key value table when output is table", async () => {
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "review", "2813489", "1", "--output", "table"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () =>
        new Response(JSON.stringify({ result: true, message: "approved" }), {
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
  assert.match(stdout, /key\s+value/);
  assert.match(stdout, /result\s+true/);
  assert.match(stdout, /message\s+approved/);
});

test("patches command supports output json", async () => {
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "patches", "2813489", "1", "--output=json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async () =>
        new Response(JSON.stringify([{ patchSetId: "source-version", versionNo: 2 }]), {
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
  assert.deepEqual(JSON.parse(stdout), [{ patchSetId: "source-version", versionNo: 2 }]);
});

test("invalid output option exits with error", async () => {
  let stderr = "";
  const exitCode = await runCli(
    ["mr", "list", "--output", "yaml"],
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
  assert.match(stderr, /Invalid --output/);
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

test("release command creates, approves, and merges using repository name", async () => {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const responses = [
    { id: "user-1", name: "Release Owner" },
    [{ id: 2813489, name: "yunxiao-cli", path: "yunxiao-cli" }],
    { localId: 17, projectId: 2813489, title: "Release release/1.2.3 into master" },
    { result: true },
    { status: "MERGED" }
  ];
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "release", "yunxiao-cli", "release/1.2.3", "master", "--yes", "--output", "json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url, init) => {
        urls.push(String(url));
        if (init?.body) {
          bodies.push(JSON.parse(String(init.body)));
        }
        return new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      },
      stdout: (text) => {
        stdout += text;
      },
      stderr: () => {}
    }
  );

  assert.equal(exitCode, 0);
  assert.match(urls[0], /\/platform\/user$/);
  assert.match(urls[1], /\/repositories\?page=1&perPage=20&search=yunxiao-cli&archived=false$/);
  assert.match(urls[2], /\/repositories\/2813489\/changeRequests$/);
  assert.match(urls[3], /\/review$/);
  assert.match(urls[4], /\/merge$/);
  assert.deepEqual(bodies[0], {
    createFrom: "COMMAND_LINE",
    reviewerUserIds: ["user-1"],
    sourceBranch: "release/1.2.3",
    sourceProjectId: 2813489,
    targetBranch: "master",
    targetProjectId: 2813489,
    title: "Release release/1.2.3 into master",
    triggerAIReviewRun: false
  });
  assert.deepEqual(bodies[2], {
    mergeType: "no-fast-forward",
    removeSourceBranch: false
  });
  assert.equal(JSON.parse(stdout).merge.status, "MERGED");
});
