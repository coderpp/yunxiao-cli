# Yunxiao CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small TypeScript CLI for common Yunxiao Codeup merge-request review and merge workflows.

**Architecture:** Keep API URL construction in a focused client module and command parsing in a thin CLI module. Read credentials from environment variables or command options; never persist personal access tokens.

**Tech Stack:** Node.js, TypeScript, Node built-in test runner.

---

### Task 1: Project Scaffold And Failing Tests

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/client.ts`
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Create: `test/client.test.ts`
- Create: `test/cli.test.ts`
- **Step 1: Write failing tests**

Cover center/region URL building, review and merge request bodies, approve-and-merge ordering, and JSON output.

- **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: TypeScript compilation fails because implementation files are empty or missing exports.

### Task 2: Implement Client And CLI

**Files:**

- Modify: `src/client.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`
- **Step 1: Implement minimal client**

Create `YunxiaoClient` methods for listing merge requests, approving, merging, approving then merging, querying change tree, and listing patch sets.

- **Step 2: Implement command parser**

Support `mr list`, `mr review`, `mr merge`, `mr approve-and-merge`, `mr tree`, and `mr patches`, with `--json` and `--yes`.

### Task 3: Docs And Verification

**Files:**

- Create: `README.md`
- **Step 1: Document setup and commands**

Explain environment variables and give examples without embedding real tokens.

- **Step 2: Verify**

Run: `npm test`
Run: `npm run build`