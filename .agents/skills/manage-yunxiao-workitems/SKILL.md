---
name: manage-yunxiao-workitems
description: 使用云效官方 MCP 查询工作项、读取链接中的完整正文和图片附件、更新负责人和参与人、查看动态及评论；项目成员维护、顶层计划完成时间和定向回复按已确认的能力缺口使用 CLI 补充。工作项访问限于预配置项目范围。
---

# 云效工作项与项目成员管理

## 使用前

先读 [公共说明](references/common.md)，按其中规则确定组织、项目范围、成员与工具。文件和写操作的补充入口见 [CLI 补充](references/cli-supplement.md)。

## 查询口径

查询参数、状态技术映射与分页规则统一见公共说明的“工作项查询”。本技能中“待办 / 待处理 / 未完成”包含 `todo+doing`；用户明确“仅 todo / 未开始”才只取 todo。“进行中”取 doing，“已完成”取 done。不要把统计技能的 todo-only 默认套入本技能。

最近一个月待办默认从上月同日至今天，按创建时间过滤。明细包含任务编码、标题与链接、计划完成时间、优先级、创建时间、工作项类型、状态和负责人。计划完成时间先取 `dueDate/planFinishTime/plannedFinishTime/expectedFinishTime`，再检查自定义字段；优先级取 `priority` 或“优先级”的 `values[].displayValue`。

链接优先用接口的 `detailUrl/webUrl/url`。无链接时，中心站可按 `https://devops.aliyun.com/projex/project/<space.id>/<category-route>/<id>` 生成并说明来源；`Req/Task/Bug` 对应 `req/task/bug`，其他类别先核实路由。Region 站沿用用户原链接的组织域名。

## 成员识别与汇总规则

“所有成员”的待办、进行中或已完成汇总，默认排除产品同事：蒋鹏、李莎仕、刘志鹏、罗宇辉、顾宝程、刘远航、王恒、彭娜娜、崔永康、王旭波、徐亚辉。用户点名某人或明确要求包含时按用户指定。除非追问，不在汇报中展示排除名单或排除前后数量。

## 根据链接读取完整工作项

1. 从链接解析项目 ID、工作项 ID，先校验项目范围，再调用 `get_work_item`。
2. 保留全部详情字段。`description` 可能是 HTML、Markdown，或含 `htmlValue/jsonMLValue` 的 JSON 字符串；先解析实际格式，不能把整个 JSON 当作正文。
3. 分页调用 `list_work_item_comments`，保留作者、时间及父评论信息；调用 `list_workitem_attachments` 取得附件列表。`includeDetails=true` 不等于已读取评论和附件。
4. 从正文与评论中的 HTML、Markdown 或 JSON 图片节点提取 `fileIdentifier` / 文件 ID，以 `(workItemId, fileId)` 去重，调用 `get_workitem_file`。参数是 `workitemId`（小写 i），其他详情/列表工具通常使用 `workItemId`。
5. `get_workitem_file` 返回临时 `url`；及时下载到本次空临时目录，不覆盖已有文件。对象存储下载请求不携带云效 PAT。不要把临时签名 URL 写入报告、说明或持久日志；持久结果保留本地路径和文件 ID。
6. 实际打开图片、读取附件后才可称已查看内容。普通附件默认只列元信息；用户要求下载，或附件是当前已授权阅读/评审的必要资料时才下载。普通附件可用附件 ID 再调用 `get_workitem_file`。
7. 需要离线内容包时，可用已有 `workitem content` 文件封装，见 CLI 补充；普通阅读仍走 MCP。也可用本地文件处理组合已取得的详情、正文、评论、图片和附件。文件失败要列出缺失部分，不能宣称完整成功；不为此新增一套云效 API 客户端。

正文图片的网页 `/projex/api/workitem/file/url` 依赖浏览器登录，不能直接用 PAT 请求；走官方 `get_workitem_file`。历史动态与关联工作项按需单独调用 `list_workitem_activities`、`list_workitem_relation_records`，不把它们混同于评论。

## 修改工作项与评论

用户已明确要求修改时，先读取详情、确认项目与成员，再调用 `update_work_item`。所有更新字段放在 `updateWorkItemFields` 内，只传用户要求修改的字段：

```json
{
  "organizationId": "<组织ID>",
  "workItemId": "<工作项ID>",
  "updateWorkItemFields": {
    "assignedTo": "<负责人用户ID>",
    "participants": ["<参与人用户ID>"]
  }
}
```

计划完成时间必须先核对字段配置。当前 MCP schema 没有顶层 `dueDate`；不得把它硬塞进参数，或未经验证改成 `customFieldValues.dueDate`。真实自定义日期字段用 `get_work_item_type_field_config` 确认 ID、类型和值格式后，才可通过 `customFieldValues` 更新；系统顶层日期按参考文档中的 CLI 补充操作处理。实际/预计工时是受控字段，不能通过 `customFieldValues` 修改。

普通评论使用 `create_work_item_comment`，传 `content` 与实际格式对应的 `formatType="MARKDOWN"` 或 `"RICHTEXT"`。文件评论先读取文件，将原文作为结构化参数。当前工具没有 `parentId`，定向回复见参考文档，不得将回复降级为新评论。评论内容须来自用户明确指令，不代写业务结论。

## 项目成员维护

当前 MCP 没有 Projex 项目成员查询、添加、移除工具。`create_resource_member/delete_resource_member/list_resource_members` 面向 Flow 的 `pipeline/hostGroup`，不能用它们操作项目成员。按 [补充操作](references/cli-supplement.md) 使用现有 CLI；多个项目时必须由用户明确目标项目，不能批量扩大范围。

## 汇报与停止条件

查询汇报项目、时间与类型范围、总数、负责人/状态汇总和关键明细。变更汇报对象、字段或成员、API 结果与回读结果。明确未读图片、未下载附件及不完整分页。

遇到权限不足、对象不存在、姓名歧义、字段不明、项目范围缺失，停止依赖该信息的操作并说明原因。可独立完成的只读部分继续；不要为测试能力创建评论、改状态或成员。
