# @coderpp/yunxiao-cli

用于评审和合并云效 Codeup 合并请求、重试云效流水线任务、查询项目协作工作项并维护项目成员的命令行工具。

## 安装

```bash
npm install
npm run build
```

本地运行：

```bash
node dist/src/index.js --help
```

如果后续发布为 npm 包，安装后可直接使用 `yunxiao` 命令。

## 通过 npx 使用

发布到 npm 后，可以直接用 `npx` 执行：

```bash
npx @coderpp/yunxiao-cli mr list --state opened
```

也可以指定版本：

```bash
npx @coderpp/yunxiao-cli@0.1.4 mr list --output json
```

包内的可执行命令名仍然是 `yunxiao`，全局安装后可这样使用：

```bash
npm install -g @coderpp/yunxiao-cli
yunxiao mr list --state opened
```

## CI/CD

仓库包含两个 GitHub Actions 工作流：

- `CI`：在 pull request 和 `main` 分支 push 时运行 `npm ci`、`npm test`、`npm run pack:dry-run`。
- `Publish`：在推送 `v*.*.*` tag 或手动触发时发布 npm 包。

自动发布使用 npm Trusted Publishing，不需要在 GitHub 保存长期 npm token。npm 包设置中需要配置 Trusted Publisher：

- Provider：GitHub Actions
- Organization or user：`coderpp`
- Repository：`yunxiao-cli`
- Workflow filename：`publish.yml`
- Environment name：留空

Trusted Publishing 要求发布环境使用 npm CLI 11.5.1 或更高版本，workflow 的发布 job 使用 Node.js 24。

发布新版本的流程：

```bash
npm version patch
git push origin main --follow-tags
```

如果手动创建 tag，需要确保 tag 和 `package.json` 版本一致，例如：

```bash
npm version 0.1.1
git push origin main v0.1.1
```

## 技能同步

当前仓库的技能位于 `.agents/skills`，可以同步到常用技能目录：

```bash
npm run skills:sync
```

同步目标：

- `~/pp-note/.agents/skills`
- `~/pp-note/.claude/skills`
- `~/.hermes/skills`

如果希望技能文件修改后自动同步，启动 watcher：

```bash
npm run skills:watch
```

Watcher 会先同步一次，然后持续监听 `.agents/skills` 文件变化；同名技能会覆盖，目标目录里的其他技能不会被删除。

如果希望后台常驻自动同步：

```bash
npm run skills:watch:start
npm run skills:watch:status
npm run skills:watch:stop
```

后台 watcher 的 PID 和日志保存在 `.git/skill-sync-watch.*`，不会提交到仓库。

## 配置

不要把个人访问令牌写入代码或提交到仓库。建议通过环境变量提供：

```bash
export YUNXIAO_TOKEN="pt-..."
export YUNXIAO_DOMAIN="openapi-rdc.aliyuncs.com"
export YUNXIAO_ORGANIZATION_ID="your-organization-id"
export YUNXIAO_EDITION="center"
export YUNXIAO_PROJECT_IDS="project-id-1,project-id-2"
export YUNXIAO_WORKITEM_CATEGORIES="Req,Task,Bug"
```

说明：

- 中心版默认使用 `openapi-rdc.aliyuncs.com`，并需要 `YUNXIAO_ORGANIZATION_ID`。
- Region 版设置 `YUNXIAO_EDITION=region`，通常不需要组织 ID。
- 也可以用命令参数覆盖配置：`--token`、`--domain`、`--organization-id`、`--edition`。
- 工作项查询不会默认扫描所有项目，需要通过 `--project-id`、`--project-ids` 或 `YUNXIAO_PROJECT_IDS` 指定项目范围。
- 工作项类型默认查询 `Req,Task,Bug`，可以通过 `--category` 或 `YUNXIAO_WORKITEM_CATEGORIES` 覆盖。

## 合并请求命令

查询合并请求列表：

```bash
node dist/src/index.js mr list --state opened --project-ids 2813489 --per-page 20
```

输出 JSON：

```bash
node dist/src/index.js mr list --state opened --output json
```

评审通过指定合并请求：

```bash
node dist/src/index.js mr review 2813489 12 --comment "LGTM"
```

合并指定合并请求：

```bash
node dist/src/index.js mr merge 2813489 12 --yes
```

评审通过并合并：

```bash
node dist/src/index.js mr approve-and-merge 2813489 12 --yes --merge-type squash --remove-source-branch
```

创建发布合并请求、自动评审通过并合并：

```bash
node dist/src/index.js mr release yunxiao-cli release/1.2.3 master --yes
```

参数顺序是：

```text
mr release <repositoryName> <sourceBranch> <targetBranch>
```

例如，把 `release` 合并到 `master`：

```bash
node dist/src/index.js mr release syjc-web release master --yes
```

这个命令会先按仓库名称查询代码库 ID，再用当前 token 对应的用户作为评审人创建合并请求，随后评审通过并合并。合并时固定保留源分支，不会删除源分支。

如果只想创建合并请求，不自动评审和合并，使用 `--create-only`：

```bash
node dist/src/index.js mr release syjc-web release master --yes --create-only
```

`--create-only` 仍会在云效创建合并请求，所以仍然需要 `--yes`。

创建合并请求时会使用云效 `createFrom=WEB`，以保证云效能正确解析源分支提交。

发布版本时，如果云效返回“源分支相对目标分支没有改动，不能新建代码评审”，可视为该仓库无改动并跳过。

发布所有版本时，推荐顺序为：

1. 商混版：`master` -> `gx-concrete/dev`
2. 蜀道版：`master` -> `sdjt/dev`
3. 标准版：`master` -> `release`

标准版应最后发布。

查询变更文件树：

```bash
node dist/src/index.js mr tree 2813489 12 \
  --from-patch-set-id target-version-id \
  --to-patch-set-id source-version-id
```

查询版本列表：

```bash
node dist/src/index.js mr patches 2813489 12
```

## 输出格式

所有会输出 API 结果的命令都支持 `--output`：

```bash
node dist/src/index.js mr list --output table
node dist/src/index.js mr list --output json
node dist/src/index.js mr review 2813489 12 --output table
node dist/src/index.js mr release yunxiao-cli release/1.2.3 master --yes --create-only --output json
node dist/src/index.js mr patches 2813489 12 --output json
node dist/src/index.js pipeline failed-runs --hours 24 --output json
node dist/src/index.js pipeline runs 123 --status FAIL --output json
node dist/src/index.js pipeline retry-job 123 456 789 --yes --output table
```

支持的格式：

- `table`：普通表格文本，默认值。
- `json`：格式化 JSON。

`--json` 仍然可用，等价于 `--output json`。

## 参数补充

`repositoryId` 可以是代码库 ID，也可以是仓库完整路径，工具会自动做 URL 编码。

会改变仓库状态的命令需要 `--yes`：

- `mr merge`
- `mr approve-and-merge`
- `mr release`

这是为了避免误合并。

未指定 `--merge-type` 时，默认使用 `no-fast-forward`。

## 项目与成员命令

查询项目列表：

```bash
node dist/src/index.js project list --name 研发 --output table
```

获取项目信息：

```bash
node dist/src/index.js project get <projectId> --output json
```

获取项目成员：

```bash
node dist/src/index.js project members <projectId> --role-id project.admin
```

添加项目成员：

```bash
node dist/src/index.js project member-add <projectId> \
  --user-ids user-id-1,user-id-2 \
  --role-id project.participant \
  --yes
```

移除项目成员：

```bash
node dist/src/index.js project member-remove <projectId> \
  --user-ids user-id-1 \
  --role-id project.participant \
  --yes
```

查询组织成员：

```bash
node dist/src/index.js member list --per-page 100
node dist/src/index.js member get <memberId> --output json
```

## 流水线命令

查询最近失败流水线运行实例，并且同一个流水线只保留最新一次失败运行：

```bash
node dist/src/index.js pipeline failed-runs --hours 24 --output table
```

默认查询最近 24 小时，等价于：

```bash
node dist/src/index.js pipeline failed-runs --hours 24
```

也可以用毫秒时间戳指定范围：

```bash
node dist/src/index.js pipeline failed-runs \
  --start-time 1777358348118 \
  --end-time 1777444748118 \
  --output json
```

查询流水线运行实例列表：

```bash
node dist/src/index.js pipeline runs <pipelineId> --status FAIL --per-page 30
```

可用过滤参数：

- `--page`、`--per-page`
- `--start-time`、`--end-time`：毫秒时间戳，例如 `1729178040000`
- `--status`：`FAIL`、`SUCCESS`、`RUNNING`
- `--trigger-mode`：触发方式，常见值为 `1` 人工触发、`2` 定时触发、`3` 代码提交触发、`5` 流水线触发、`6` Webhook 触发

获取单次流水线运行详情：

```bash
node dist/src/index.js pipeline run <pipelineId> <pipelineRunId> --output json
```

运行详情里包含阶段和任务信息，重试任务时需要从返回结果里的 `stages[].stageInfo.jobs[].id` 获取 `jobId`。

重试指定流水线任务：

```bash
node dist/src/index.js pipeline retry-job <pipelineId> <pipelineRunId> <jobId> --yes
```

`pipeline` 也可以简写为 `pl`，`retry-job` 也可以简写为 `retry`：

```bash
node dist/src/index.js pl retry <pipelineId> <pipelineRunId> <jobId> --yes
```

## 工作项命令

查询当前用户待办工作项：

```bash
node dist/src/index.js workitem mine --project-ids project-id-1,project-id-2 --state todo
```

查询指定成员待办、进行中或已完成工作项：

```bash
node dist/src/index.js workitem list --project-ids project-id-1,project-id-2 --assigned-to user-id --state todo
node dist/src/index.js workitem list --project-ids project-id-1,project-id-2 --assigned-to user-id --state doing
node dist/src/index.js workitem list --project-ids project-id-1,project-id-2 --assigned-to user-id --state done
```

按时间范围查询工作项：

```bash
node dist/src/index.js workitem list \
  --project-ids project-id-1,project-id-2 \
  --from "2026-04-01 00:00:00" \
  --to "2026-04-30 23:59:59"
```

默认时间字段为 `gmtCreate`。如需按更新时间等字段过滤，可加 `--date-field gmtModified` 或其他云效支持的字段标识。

如果已知云效状态 ID，可使用服务端状态过滤：

```bash
node dist/src/index.js workitem list --project-ids project-id-1 --status-ids 100005,100010
```

`--state todo|doing|done` 是便捷过滤，会根据返回结果中的状态英文名或中文名做本地过滤；不同项目模板状态差异较大时，优先使用 `--status-ids`。

默认只查询每个项目的一页结果。需要拉取所有分页时可以加 `--all-pages`：

```bash
node dist/src/index.js workitem list --project-ids project-id-1,project-id-2 --all-pages
```

获取工作项详情、动态、评论：

```bash
node dist/src/index.js workitem get <workitemId> --output json
node dist/src/index.js workitem activities <workitemId>
node dist/src/index.js workitem comments <workitemId>
node dist/src/index.js workitem timeline <workitemId> --output json
```

修改工作项负责人、参与人和计划完成时间：

```bash
node dist/src/index.js workitem update <workitemId> \
  --assigned-to user-id \
  --participants user-id-1,user-id-2 \
  --due-date "2026-05-01 18:00:00" \
  --yes
```

计划完成时间默认写入字段 `dueDate`。如果项目模板使用的是自定义字段，可以用 `--due-field <fieldId>` 覆盖：

```bash
node dist/src/index.js workitem update <workitemId> \
  --due-field custom-plan-finish-field-id \
  --due-date "2026-05-01 18:00:00" \
  --yes
```

也可以用 `--field key=value` 或 `--fields '{"fieldId":"value"}'` 更新云效支持的其他字段。

创建工作项评论：

```bash
node dist/src/index.js workitem comment <workitemId> --content "处理完成，请确认。" --yes
```

会改变云效数据的命令需要 `--yes`：

- `project member-add`
- `project member-remove`
- `pipeline retry-job`
- `workitem update`
- `workitem comment`
