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

安装 npm 包后可直接使用 `yunxiao` 命令。

## 通过 npx 使用

可以直接用 `npx` 执行：

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
node dist/src/index.js mr release example-web release master --yes
```

这个命令会先按仓库名称查询代码库 ID，再用当前 token 对应的用户作为评审人创建合并请求，随后评审通过并合并。合并时固定保留源分支，不会删除源分支。

如果只想创建合并请求，不自动评审和合并，使用 `--create-only`：

```bash
node dist/src/index.js mr release example-web release master --yes --create-only
```

`--create-only` 仍会在云效创建合并请求，所以仍然需要 `--yes`。

创建合并请求时会使用云效 `createFrom=WEB`，以保证云效能正确解析源分支提交。

发布版本时，如果云效返回“源分支相对目标分支没有改动，不能新建代码评审”，可视为该仓库无改动并跳过。

目标分支和多个版本的发布顺序由使用方按自己的项目约定指定。

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

按创建人查询工作项：

```bash
node dist/src/index.js workitem list --project-ids project-id-1,project-id-2 --created-by user-id
```

`--created-by` 支持逗号分隔多个用户 ID，也可以使用等价参数 `--creator`。

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

## 根据链接读取完整工作项及下载文件

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem content "<云效工作项链接>" --dir ./content
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem content "<云效工作项链接>" --dir ./content --download-attachments

# 单独下载正文及评论图片，或普通附件
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem images <workitemId> --dir ./images
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem attachments <workitemId> --dir ./attachments
```

`content`、`images`、`attachments` 始终输出 JSON。沿用现有 Token、组织、中心版/Region 版配置，
`content` 校验链接项目位于 `YUNXIAO_PROJECT_IDS` 或 `--project-ids` 配置的范围内。
`content` 保留全部详情字段和评论原文，`descriptionHtml`、评论 `contentHtml` 的图片引用替换为本地绝对路径；
`images` 返回 `fileId`、`path`、`source`，支持 HTML、富文本 JSON、Markdown，跨来源重复图片只下载一次。
普通附件默认仅返回元信息；开启 `--download-attachments` 后返回附件 `path`。
不返回附件临时签名 URL，下载时不向存储站点传递 Token。
图片位于 `images/`、普通附件位于 `attachments/`，默认根目录为 `workitem-<ID>-content`。
已有文件不覆盖，重复读取请选择新目录；失败返回非零退出码，清理未完成文件并保留已完成文件。
仅支持带 `fileIdentifier` 的云效图片（PNG/JPEG/GIF/WebP/BMP/ICO）；外部图片和 data URL 会报错。
需要工作项、评论、附件只读权限。完整内容不递归包含关联工作项或历史动态。

## 0.2.0 新增能力

以下命令与错误契约要求 `@coderpp/yunxiao-cli >= 0.2.0`。

## 完整查询与可靠请求

分页接口统一支持 `--page`、`--per-page`（1–100）、`--all-pages`：

```bash
yunxiao mr list --state opened --all-pages --output json
yunxiao project list --all-pages
yunxiao member list --all-pages
yunxiao pipeline list --name 发布 --all-pages
yunxiao pipeline runs 123 --all-pages
yunxiao workitem mine --all-pages
```

默认每页 20 条；`pipeline failed-runs` 保持内部全量扫描和默认每页 30 条。
工作项按项目分别分页后再过滤状态。没有使用 `--all-pages` 的状态查询会提示结果范围。
分页优先采用响应头的下一页和实际页大小；无分页元信息时根据返回条数判断。
重复页、分页中断或保护上限触发时返回非零退出码，不输出不完整的聚合结果。
`project members`、工作项评论等无分页接口直接返回完整 API 响应，不接受分页选项。

API 请求默认 `--timeout-ms 30000 --retries 2`。超时覆盖响应体读取；文件下载也使用该超时，失败清理未完成文件。
仅只读操作会在网络临时错误、429、502/503/504 时退避重试，包括工作项/项目搜索和 MR 评论查询这些只读 POST。
遵循 `Retry-After`；要求等待超过 60 秒时返回限流错误，由调用方稍后重试。
写操作不自动重放，网络错误、超时或服务端 5xx 可能返回“写入结果未知”，应先查服务端状态。
文件下载保留单次读取行为，不自动重试。

未知参数、缺值、重复的非集合参数、额外位置参数、非法枚举和数值会报错。
`--field` 可重复；`--key=a=b` 会完整保留 `a=b`。布尔参数支持 `--yes=false` 等写法。
`--version` 和 `yunxiao mr diff --help` 等子命令帮助不需要 Token。
原有 `pl`、`wi` 和命令别名继续支持，输出与主命令一致。

## MR 详情、差异与评论

```bash
yunxiao mr get 2813489 12 --output json
yunxiao mr diff 2813489 12 --output json
yunxiao mr diff 2813489 12 --file src/example.ts --output text
yunxiao mr diff 2813489 12 --from-patch-set-id target-id --to-patch-set-id source-id --output json
yunxiao mr comments 2813489 12 --resolved=false --output json
yunxiao mr comments 2813489 12 --comment-type INLINE_COMMENT --file src/example.ts

yunxiao mr comment 2813489 12 --content-file ./review.md --yes
yunxiao mr comment 2813489 12 --parent-id comment-id --content "已处理，请复核" --yes
yunxiao mr comment 2813489 12 --file src/example.ts --line 42 --side new \
  --from-patch-set-id target-id --to-patch-set-id source-id --content "这里需要处理空值" --yes
```

`mr diff` 从 MR 版本列表解析并固定版本 ID、提交 SHA；默认取最新目标和源版本。
使用固定 SHA 调用代码比较 API（目标到源使用 merge-base；源版本之间使用直接比较），并与相同版本对的 MR 文件树核对文件对象 ID、数量及增删行数。
响应包含版本 ID、SHA、`complete` 和逐文件原因；二进制、缺失、截断或比较不一致时标记不完整。
这是完整性核对而非绕过服务端 diff 限额；跨库提交不可访问时会保留服务端错误。
`--output text` 可直接读取 diff，但机器验收应检查 JSON 的 `complete`；成功读取不等同于内容完整。

行内评论必须指定文件、正整数行号、`--side old|new` 和 `--to-patch-set-id`；未指定起始版本时解析最新目标版本。
两端版本必须属于该 MR，文件必须存在于对应侧的变更树；服务端继续校验实际评论行位置。
普通评论默认绑定最新源版本，也可用 `--to-patch-set-id` 固定版本。
评论支持 `--parent-id` 回复，默认直接发表、未解决。评论编辑、删除、解决状态操作不在本轮范围。

## 通用 MR 管理与发布恢复

```bash
yunxiao mr create 2813489 --source feature/demo --target master --title "功能说明" \
  --description-file ./mr.md --reviewers user-1,user-2 --yes
yunxiao mr update 2813489 12 --title "更新标题" --description-file ./mr.md --yes
yunxiao mr update 2813489 12 --description= --yes
yunxiao mr close 2813489 12 --yes
yunxiao mr review 2813489 12 --opinion not-pass --comment-file ./review.md
yunxiao mr release example-web master release --resume 12 --yes --output json
```

`mr create` 只创建；默认同仓库，可用 `--source-project-id` 指定源库。
`mr review` 默认 `--opinion pass`，保留已有调用方式。
新建、修改、关闭、评论、流水线启动和取消等新写命令都需要 `--yes`。

发布按以下规则执行：

- 仓库查询完整分页并精确匹配；同名歧义需要完整命名空间路径。
- 创建前查找相同源/目标库及分支的未关闭 MR；发现已有 MR 返回错误、链接和显式恢复参数，避免自动接管。
- `--resume` 校验 MR 的库及分支；已合并返回 `already-merged`，已关闭拒绝执行。
- 仅在服务端能证明当前用户已于当前版本创建后评审通过时跳过评审，否则重新评审当前版本；评审前后核对源版本，变化时停止合并。
- 创建请求结果未知时只读查询相同 MR 并返回恢复信息；不会自动再次创建或直接评审。
- 合并响应丢失时查询 MR，已合并按成功返回，否则保留结果未知。
- 明确的“源分支相对目标分支没有改动，不能新建代码评审”返回 `status: skipped`；其他创建错误仍失败。
- 部分完成返回已创建 MR、已完成阶段、失败阶段及 `resumeArgs`。这些参数为数组，调用方应逐项传参；显式传入的 profile、配置文件、组织、域名和版本会被保留，Token 不会写入恢复参数。

服务端最终负责合并冲突及门禁检查。版本检查和合并不是原子操作，无法保证检查后分支不会被其他人更新。
MR 合并成功不表示流水线或部署成功；用流水线命令另行核对。

## 流水线列表、日志、启动和取消

```bash
yunxiao pipeline list --name 发布 --all-pages
yunxiao pipeline jobs 123 456 --output json
yunxiao pipeline logs 123 456 789 --output text
yunxiao pipeline start 123 --params-file ./run.json --yes --output json
yunxiao pipeline cancel 123 456 --yes --output json
```

`jobs` 从运行详情整理阶段、任务信息；`logs` 返回单次日志快照，JSON 保留 `content`、`last`、`more`，文本模式在存在更多日志时提示。
`start` 返回 `pipelineRunId`；`params-file` 内容直接写运行参数对象，CLI 按 API 要求包装成 `params` JSON 字符串。例如：

```json
{"envs":{"ENV":"test"},"runningBranchs":{"https://codeup.aliyun.com/org/app.git":"master"},"comment":"手动验证"}
```

`cancel` 返回接受结果和随后的运行状态；返回接受成功不代表运行已终止。读取状态失败返回部分完成错误。

## 配置与诊断

```bash
yunxiao config set dev --organization-id org-id --edition center --token-env DEV_YUNXIAO_TOKEN --project-ids project-1
yunxiao config use dev
yunxiao config list
yunxiao config show --profile dev
yunxiao auth whoami --profile dev
yunxiao doctor
yunxiao doctor --remote
```

默认配置文件为 `$XDG_CONFIG_HOME/yunxiao/config.json`，未设置时为 `~/.config/yunxiao/config.json`。
可用 `--config` 或 `YUNXIAO_CONFIG` 覆盖路径；配置文件权限为 0600。
通过 `--profile`、`YUNXIAO_PROFILE` 或保存的当前 profile 选择配置。
取值优先级：命令参数 > 环境变量 > profile > 默认值。
profile 保存域名、组织、版本、项目、分类及 `token-env` 环境变量名，不保存明文 Token。
`config show` 显示 profile 保存值；环境变量覆盖的最终效果可通过诊断核对。

`doctor` 检查配置、Token 是否存在和域名/版本格式，不发请求。
`doctor --remote` 额外读取当前用户验证连接和身份；不会验证每个项目的访问权限或写权限。

## 文件输入与错误契约

描述、内容、评审意见及运行参数分别支持 `--description-file`、`--content-file`、`--comment-file`、`--params-file`。
文件名 `-` 读取 stdin；一次命令只能有一个 stdin 输入。相同字段的直接文本与文件输入互斥。
UTF-8 内容、换行和等号原样保留；文件无法读取时在 API 调用前失败。

```bash
yunxiao workitem comment workitem-id --content-file ./comment.md --yes
yunxiao workitem comment workitem-id --parent-id comment-id --content "回复" --yes
yunxiao mr get 2813489 12 --output json --error-format json
```

成功结果写 stdout，分页提示与错误写 stderr。`--error-format json` 的错误结构：

```json
{"error":{"code":"PARTIAL_OPERATION","message":"...","details":{"localId":12,"completed":["create"],"failedStage":"review","resumeArgs":["mr","release","app","master","release","--resume","12","--yes"]}}}
```

服务端提供请求 ID 时错误中保留 `requestId`；Token 和带查询参数的 URL 会被脱敏。
退出码从原先统一的 1 细分为：0 成功/明确跳过，1 未分类/响应格式错误，2 参数或配置错误，3 认证或权限错误，4 不存在，5 冲突或前置条件不满足，6 网络/超时/限流/服务不可用，7 部分完成或写入结果未知。
已有脚本应以非零判断失败，需要细分时再按上述约定处理。

### API 契约参考

- [MR 版本列表](https://help.aliyun.com/zh/yunxiao/developer-reference/listchangerequestpatchsets-query-the-list-of-merge-request-versions)、[变更文件树](https://help.aliyun.com/zh/yunxiao/developer-reference/getchangerequesttree-queries-the-change-file-tree-for-merge-requests)、[固定提交比较](https://help.aliyun.com/zh/yunxiao/developer-reference/getcompare)
- [MR 评论列表](https://help.aliyun.com/zh/yunxiao/developer-reference/listmergerequestcomments)、[创建 MR 评论](https://help.aliyun.com/zh/yunxiao/developer-reference/createchangerequestcomment)
- [启动流水线](https://help.aliyun.com/zh/yunxiao/developer-reference/createpipelinerun)、[终止运行](https://help.aliyun.com/zh/yunxiao/developer-reference/updatepipelinerun)、[任务日志](https://help.aliyun.com/zh/yunxiao/developer-reference/getpipelinejobrunlog)
