---
name: manage-yunxiao-workitems
description: Use when a technical lead wants to query or update Yunxiao project workitems, inspect workitem activities/comments, or add/remove Yunxiao project members within a preconfigured project scope.
---

# 云效工作项与项目成员管理

## 目标

帮助技术负责人快速查看待办、进行中、已完成工作项，调整工作项负责人/参与人/计划完成时间，维护项目成员，并补充工作项评论。

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

所有或指定成员进行中的工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state doing --all-pages --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --assigned-to <userId> --state doing --all-pages --output json
```

所有或指定成员已完成的工作项：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state done --all-pages --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --assigned-to <userId> --state done --all-pages --output json
```

按时间范围查询时追加：

```bash
--from "YYYY-MM-DD 00:00:00" --to "YYYY-MM-DD 23:59:59"
```

如果用户只给开始时间或结束时间，只追加对应参数。默认时间字段为 `gmtCreate`；如果用户要求按更新时间查询，追加 `--date-field gmtModified`。

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
- 总数。
- 按负责人或状态汇总。
- 关键明细：编号、标题、状态、负责人、工作项 ID。

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
