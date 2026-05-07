---
name: manage-yunxiao-workitems
description: Use when a technical lead wants to query or update Yunxiao project workitems, inspect workitem activities/comments, or add/remove Yunxiao project members within a preconfigured project scope.
---

# 云效工作项与项目成员管理

## 目标

帮助技术负责人快速查看待办、进行中、已完成工作项，调整工作项负责人/参与人/计划完成时间，维护项目成员，并补充工作项评论。

## 运行前置：加载 `.env`

所有云效 CLI 命令运行前，必须先在 `yunxiao-cli` 仓库根目录加载 `.env`，且加载动作必须和实际命令在同一个 shell 中；如果每次用新的 shell 调用，就每次都重新加载。

```bash
cd /Users/pp/repos/yunxiao-cli
set -a
source .env
set +a
npx --yes --package @coderpp/yunxiao-cli yunxiao <command>
```

`.env` 不存在、加载失败或必要的 `YUNXIAO_*` 环境变量缺失时，停止并提示用户。不要打印 `.env` 内容、token 或其他密钥。

## 固定命令前缀

默认用 npx 方式运行：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

如果是在 `yunxiao-cli` 仓库内验证尚未发布的新命令，可临时使用本地构建：

```bash
node dist/src/index.js
```

## 项目范围

项目范围必须由环境变量提前确定：

```bash
YUNXIAO_PROJECT_IDS
```

不要自行扩展到所有项目。若 `YUNXIAO_PROJECT_IDS` 未设置，或用户要求的项目不在该范围内，停止并询问用户。

工作项查询默认不按类型筛选；不要主动添加 `--category`，除非用户明确指定工作项类型范围。

## 成员识别

- 如果用户提供的是用户 ID，直接使用。
- 如果用户提供的是姓名，先解析为用户 ID，再执行工作项或成员变更命令。
- 可通过项目成员或组织成员查询解析姓名：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao member list --per-page 100 --output json
```

如果姓名匹配多个成员，必须停止并请用户确认具体用户。

## 产品同事排除规则

当用户要求查询“所有成员”的待办、进行中或已完成工作项时，默认从结果中排除以下产品同事：

- 蒋鹏
- 李莎仕
- 刘志鹏
- 罗宇辉
- 顾宝程
- 刘远航

该规则只用于“所有成员”汇总或列表。用户明确指定某个成员时，即使该成员在排除名单中，也按用户指定查询。

## 查询工作项

当前用户待办工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem mine --state todo --all-pages --output json
```

指定成员待办工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --assigned-to <userId> --state todo --all-pages --output json
```

所有成员待办工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state todo --all-pages --output json
```

查询结果中排除产品同事后再汇总和汇报。

所有或指定成员进行中的工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state doing --all-pages --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --assigned-to <userId> --state doing --all-pages --output json
```

只有未指定成员的“所有成员进行中”查询需要排除产品同事。

所有或指定成员已完成的工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state done --all-pages --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --assigned-to <userId> --state done --all-pages --output json
```

只有未指定成员的“所有成员已完成”查询需要排除产品同事。

按时间范围查询时追加：

```bash
--from "YYYY-MM-DD 00:00:00" --to "YYYY-MM-DD 23:59:59"
```

如果用户只给开始时间或结束时间，只追加对应参数。默认时间字段为 `gmtCreate`；如果用户要求按更新时间查询，追加 `--date-field gmtModified`。

## 最近 1 个月所有成员待办明细

当用户要求“所有成员最近 1 个月待办事项明细”“近一个月待办明细”时，执行所有成员待办查询，并追加最近 1 个月时间范围。默认按创建时间 `gmtCreate` 过滤；如果用户明确要求按更新时间或其他时间字段，再切换 `--date-field`。

macOS/zsh 可用以下时间范围：

```bash
START="$(date -v-1m '+%Y-%m-%d 00:00:00')"
END="$(date '+%Y-%m-%d 23:59:59')"
```

查询命令：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state todo --from "$START" --to "$END" --all-pages --output json
```

该场景属于“所有成员”查询，默认应用产品同事排除规则；除非用户明确要求包含产品同事。

明细输出字段必须包含：

- 任务编码：`serialNumber`
- 标题：`subject`
- 链接：优先使用返回数据中的 `detailUrl`、`webUrl` 或 `url`；如果接口未返回链接，用 `https://devops.aliyun.com/projex/project/<space.id>/<category-route>/<id>` 生成链接，并在汇报中说明链接由工作项 ID 拼接。`category-route` 按 `categoryId` 映射：`Req` → `req`，`Task` → `task`，`Bug` → `bug`，其他值使用小写形式。
- 计划完成时间：优先读取直接字段 `dueDate`、`planFinishTime`、`plannedFinishTime`、`expectedFinishTime`；如果没有，查找 `customFieldValues` 中 `fieldName` 包含“计划完成”“截止”“到期”的字段。
- 优先级：优先读取 `customFieldValues` 中 `fieldId` 为 `priority` 或 `fieldName` 为“优先级”的字段，取 `values[].displayValue`。
- 创建时间：`gmtCreate`，转换成本地时间 `YYYY-MM-DD HH:mm:ss`。
- 工作项类型：`workitemType.name`。

输出优先使用 Markdown 表格；如果条目很多，先按负责人分组，再列每人的明细。

## 查询工作项动态与评论

获取工作项动态及评论：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem timeline <workitemId> --output json
```

如果用户只要动态或只要评论：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem activities <workitemId> --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem comments <workitemId> --output json
```

## 修改工作项

修改负责人、参与人和计划完成时间：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem update <workitemId> \
  --assigned-to <ownerUserId> \
  --participants <userId1,userId2> \
  --due-date "YYYY-MM-DD HH:mm:ss" \
  --yes \
  --output json
```

只修改其中一部分时，只传对应参数。执行前必须确认：

- 工作项 ID 明确。
- 负责人和参与人都已解析为用户 ID。
- 计划完成时间格式明确。
- 用户确实要求修改。

如果项目使用自定义计划完成时间字段，使用：

```bash
--due-field <fieldId>
```

## 创建工作项评论

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem comment <workitemId> --content "<comment>" --yes --output json
```

评论内容必须来自用户明确指令，不要代写业务结论。

## 项目成员维护

添加项目成员：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao project member-add <projectId> --user-ids <userId1,userId2> --role-id project.participant --yes --output json
```

移除项目成员：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao project member-remove <projectId> --user-ids <userId1,userId2> --role-id project.participant --yes --output json
```

如果 `YUNXIAO_PROJECT_IDS` 包含多个项目，且用户没有明确指定要维护哪个项目，必须停止并询问用户。不要默认对所有项目添加或移除成员。

## 汇报要求

查询类任务汇报：

- 项目范围。
- 总数；如果应用了产品同事排除规则，同时汇报排除后总数。
- 按负责人或状态汇总。
- 关键明细：编号、标题、状态、负责人、工作项 ID。
- 如果应用了产品同事排除规则，说明已排除的产品同事名单。

变更类任务汇报：

- 执行了什么变更。
- 影响的工作项或项目。
- 涉及成员。
- API 返回是否成功。

## 停止条件

遇到以下情况必须停止并询问用户：

- API 返回权限不足、参数错误、字段不存在、成员不存在或工作项不存在。
- 用户姓名匹配多个成员或无法匹配成员。
- 项目范围缺失或项目范围不明确。
- 用户要求修改数据但没有明确工作项、成员、项目或评论内容。
- 任何会修改数据的命令缺少 `--yes`。
