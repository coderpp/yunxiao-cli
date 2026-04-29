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
    createFrom: "WEB",
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

test("release command supports create-only mode", async () => {
  const urls: string[] = [];
  const responses = [
    { id: "user-1", name: "Release Owner" },
    [{ id: 2813489, name: "yunxiao-cli", path: "yunxiao-cli" }],
    { localId: 18, projectId: 2813489, title: "Release release/1.2.3 into master" }
  ];
  let stdout = "";
  const exitCode = await runCli(
    ["mr", "release", "yunxiao-cli", "release/1.2.3", "master", "--yes", "--create-only", "--output", "json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url) => {
        urls.push(String(url));
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
  assert.equal(urls.length, 3);
  assert.match(urls[2], /\/repositories\/2813489\/changeRequests$/);
  const result = JSON.parse(stdout);
  assert.equal(result.changeRequest.localId, 18);
  assert.equal(result.review, null);
  assert.equal(result.merge, null);
});

test("project member-add command requires confirmation and sends member body", async () => {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const exitCode = await runCli(
    ["project", "member-add", "project-1", "--user-ids", "user-1,user-2", "--role-id", "project.admin", "--yes"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url, init) => {
        urls.push(String(url));
        bodies.push(JSON.parse(String(init?.body)));
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
  assert.equal(
    urls[0],
    "https://openapi-rdc.aliyuncs.com/oapi/v1/projex/organizations/org-1/projects/project-1/members"
  );
  assert.deepEqual(bodies[0], {
    roleId: "project.admin",
    userIds: ["user-1", "user-2"]
  });
});

test("workitem mine searches configured projects and filters todo state", async () => {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const responses = [
    { id: "user-1", name: "Current User" },
    [
      {
        id: "wi-1",
        subject: "处理待办",
        status: { nameEn: "TODO", displayName: "待处理" },
        assignedTo: { id: "user-1", name: "Current User" }
      }
    ],
    [
      {
        id: "wi-2",
        subject: "进行中事项",
        status: { nameEn: "DOING", displayName: "进行中" },
        assignedTo: { id: "user-1", name: "Current User" }
      }
    ]
  ];
  let stdout = "";

  const exitCode = await runCli(
    ["workitem", "mine", "--project-ids", "project-1,project-2", "--state", "todo", "--output", "json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1",
      YUNXIAO_WORKITEM_CATEGORIES: "Req,Task"
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
  assert.match(urls[1], /\/workitems:search$/);
  assert.match(urls[2], /\/workitems:search$/);
  assert.deepEqual(bodies[0], {
    category: "Req,Task",
    conditions:
      '{"conditionGroups":[[{"fieldIdentifier":"assignedTo","operator":"CONTAINS","value":["user-1"],"toValue":null,"className":"user","format":"list"}]]}',
    orderBy: "gmtCreate",
    page: 1,
    perPage: 20,
    sort: "desc",
    spaceId: "project-1",
    spaceType: "Project"
  });
  assert.deepEqual(JSON.parse(stdout), [
    {
      queryProjectId: "project-1",
      id: "wi-1",
      subject: "处理待办",
      status: { nameEn: "TODO", displayName: "待处理" },
      assignedTo: { id: "user-1", name: "Current User" }
    }
  ]);
});

test("workitem update supports assigned user, participants, due date, and custom fields", async () => {
  let body: unknown;
  const exitCode = await runCli(
    [
      "workitem",
      "update",
      "workitem-1",
      "--assigned-to",
      "user-2",
      "--participants",
      "user-2,user-3",
      "--due-date",
      "2026-05-01 18:00:00",
      "--field",
      "priority=high",
      "--yes",
      "--output",
      "json"
    ],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (_url, init) => {
        body = JSON.parse(String(init?.body));
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
  assert.deepEqual(body, {
    assignedTo: "user-2",
    dueDate: "2026-05-01 18:00:00",
    participants: ["user-2", "user-3"],
    priority: "high"
  });
});

test("pipeline runs command sends list filters and prints JSON", async () => {
  const urls: string[] = [];
  let stdout = "";
  const exitCode = await runCli(
    [
      "pipeline",
      "runs",
      "123",
      "--status",
      "FAIL",
      "--start-time",
      "1729178040000",
      "--end-time",
      "1729181640000",
      "--trigger-mode",
      "3",
      "--output",
      "json"
    ],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url) => {
        urls.push(String(url));
        return new Response(JSON.stringify([{ pipelineRunId: 456, pipelineId: 123, status: "FAIL" }]), {
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
  assert.equal(
    urls[0],
    "https://openapi-rdc.aliyuncs.com/oapi/v1/flow/organizations/org-1/pipelines/123/runs?startTime=1729178040000&endTme=1729181640000&status=FAIL&triggerMode=3"
  );
  assert.deepEqual(JSON.parse(stdout), [{ pipelineRunId: 456, pipelineId: 123, status: "FAIL" }]);
});

test("pipeline failed-runs keeps latest failed run per pipeline", async () => {
  const urls: string[] = [];
  const responses = [
    [
      { pipelineId: 1, pipelineName: "后端流水线" },
      { pipelineId: 2, pipelineName: "前端流水线" }
    ],
    [
      { pipelineRunId: 10, pipelineId: 1, status: "FAIL", startTime: 1999998000000, endTime: 1999998100000 },
      { pipelineRunId: 11, pipelineId: 1, status: "FAIL", startTime: 1999999000000, endTime: 1999999100000 }
    ],
    [
      { pipelineRunId: 20, pipelineId: 2, status: "FAIL", startTime: 1999997000000, endTime: 1999997100000 }
    ]
  ];
  let stdout = "";
  const exitCode = await runCli(
    ["pipeline", "failed-runs", "--hours", "24", "--end-time", "2000000000000", "--output", "json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url) => {
        urls.push(String(url));
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
  assert.equal(urls.length, 3);
  assert.equal(
    urls[0],
    "https://openapi-rdc.aliyuncs.com/oapi/v1/flow/organizations/org-1/pipelines?page=1&perPage=30&executeStartTime=1999913600000&executeEndTime=2000000000000&statusList=FAIL"
  );
  assert.match(urls[1], /\/pipelines\/1\/runs\?/);
  assert.match(urls[2], /\/pipelines\/2\/runs\?/);
  assert.deepEqual(
    JSON.parse(stdout).map((row: Record<string, unknown>) => ({
      pipelineId: row.pipelineId,
      pipelineName: row.pipelineName,
      pipelineRunId: row.pipelineRunId
    })),
    [
      { pipelineId: 1, pipelineName: "后端流水线", pipelineRunId: 11 },
      { pipelineId: 2, pipelineName: "前端流水线", pipelineRunId: 20 }
    ]
  );
});

test("pipeline retry-job requires confirmation", async () => {
  let stderr = "";
  const exitCode = await runCli(
    ["pipeline", "retry-job", "123", "456", "789"],
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

test("pipeline retry-job calls retry API when confirmed", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let stdout = "";
  const exitCode = await runCli(
    ["pipeline", "retry-job", "123", "456", "789", "--yes", "--output", "json"],
    {
      YUNXIAO_TOKEN: "pt-test",
      YUNXIAO_ORGANIZATION_ID: "org-1"
    },
    {
      fetcher: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify(true), {
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
  assert.equal(calls[0].init?.method, "PUT");
  assert.equal(
    calls[0].url,
    "https://openapi-rdc.aliyuncs.com/oapi/v1/flow/organizations/org-1/pipelines/123/pipelineRuns/456/jobs/789/retry"
  );
  assert.equal(JSON.parse(stdout), true);
});
