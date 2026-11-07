# 官方 MCP 能力与验证范围

核对日期：2026-11-04。依据为本机会话实际注册的 `mcp__yunxiao__*` 参数 schema、只读调用，以及现有 `@coderpp/yunxiao-cli` 源码和技能。2026-11-07 起技能只使用官方 MCP，不再提供 CLI 补充。工具会随服务版本和 toolsets 改变，执行时重新发现目标工具；不能将本表视为永久缺口清单。

后续完整 CLI 命令对比补充了关闭 MR、取消整次流水线两项；这两项只核对官方工具注册与本地 CLI 定义，未执行写入。来源：[Codeup 工具](https://github.com/aliyun/alibabacloud-devops-mcp-server/blob/master/tool-registry/code-management.ts)、[Flow 工具](https://github.com/aliyun/alibabacloud-devops-mcp-server/blob/master/tool-registry/pipeline.ts)。

官方来源：[阿里云使用说明](https://help.aliyun.com/zh/yunxiao/developer-reference/cloud-effect-mcp-tool-instructions)、[官方开源仓库](https://github.com/aliyun/alibabacloud-devops-mcp-server)。现有场景需要 code-management、project-management、pipeline-management、organization-management 工具集。未暴露工具时先区分客户端工具集限制和服务能力缺失，不擅自改配置或扩权。

## 对照结论

| 现有需求 | 官方 MCP 对应能力 | 迁移结论 |
|---|---|---|
| 工作项列表、负责人/创建人/时间筛选 | `search_workitems` | 可替换；逐项目分页，状态按既有口径分类 |
| 详情、评论、动态、附件列表 | `get_work_item`、`list_work_item_comments`、`list_workitem_activities`、`list_workitem_attachments` | 有对应工具；评论需分页 |
| 正文/评论图片与普通附件下载 | `get_workitem_file` | 能取得临时 URL；下载并实际打开图片、读取附件；离线包用本地文件工具整理 MCP 数据 |
| 负责人、参与人更新 | `update_work_item.updateWorkItemFields` | schema 覆盖；真实写入未测试 |
| 自定义日期字段 | `get_work_item_type_field_config` + `customFieldValues` | 条件覆盖，必须确认实际字段和值格式；未验证真实日期写入 |
| 顶层系统 `dueDate` | 当前 `updateWorkItemFields` 无该参数 | 未覆盖时说明限制并停止该字段更新；不能擅自改为自定义字段 |
| 普通评论、从文件读取评论内容 | `create_work_item_comment` | 可替换；文件内容由本地读取后传 `content` |
| 对指定评论回复 | 当前 `create_work_item_comment` 无 `parentId` | 未覆盖时说明限制；不得降级为新评论 |
| 组织成员查询 | `search_organization_members`、`list_organization_members` | 有对应工具，不等于项目成员 |
| Projex 项目成员列表/增删 | 无项目成员对应工具 | 未覆盖时说明限制并停止成员操作；Flow 的 `resource_member` 工具不可替代 |
| MR 列表、详情、补丁集 | `list_change_requests`、`get_change_request`、`list_change_request_patch_sets` | 可替换；继续保留 Git 精确快照评审 |
| 关闭 MR | 当前未提供 Codeup 关闭 MR 工具 | 未覆盖时说明限制并停止关闭；AppStack 关闭变更工具不能替代 |
| MR 创建、批准、合并 | `create_change_request`、`review_change_request`、`merge_change_request` | schema 覆盖；查重、防竞态、恢复与回读由技能组织 |
| 版本发布一键流程 | 上述多个 MR 工具 | 可组合实现；保持版本顺序、分支映射与保留 master |
| 失败运行、任务与日志 | `list_pipelines`、`list_pipeline_runs`、`get_pipeline_run`、日志工具 | 可替换；需修正分页终止判断 |
| 取消整次流水线运行 | 当前工具提供停止单个 job，无直接取消整个 run 工具 | 未覆盖时说明限制并停止取消；不能当作重试的附带操作 |
| 失败任务重试 | `retry_pipeline_job_run` | schema 覆盖；真实重试未测试 |
| 人员月报/周报、历史运行导出 | MCP 查询 + 本地汇总/制表 | 可组合实现；全量分页、状态口径和文件交付由技能负责 |

结论：云效技能只使用官方 MCP。缺少工具或参数时说明限制并停止依赖操作，不用 CLI 或自行调用云效 HTTP API 补齐。项目范围、状态分类、批处理顺序和未知写入恢复仍由技能维护。

## 只读验证记录

- `get_current_organization_info` 返回当前用户与组织，并与本地已有组织配置一致。
- 配置范围内一个项目：`search_workitems(includeDetails=true)`、`get_work_item`、`list_work_item_comments` 成功；正文为含 `htmlValue/jsonMLValue` 的 JSON 字符串。`list_workitem_attachments` 成功但样本为空，不代表已验证普通附件下载。
- 正文图片 `get_workitem_file` 返回文件名、大小、后缀及临时 URL。此次没有下载二进制或验证图片识别，也没有保存临时 URL。
- `syjc-boot` 的 MR !3151：仓库搜索、MR 列表/详情、补丁集查询成功；补丁集包含 `MERGE_SOURCE/MERGE_TARGET`、`versionNo/patchSetBizId/commitId/ref`，足以保留原锁定流程。列表样本未包含 status，详情含 status。
- 流水线 5322673：列表、运行第 1/2 页与运行详情成功，第 13 页为空。第 1 页 `nextPage=null,total=0`，第 2 页仍有不同运行；流水线列表第 2 页也返回不同流水线但 pagination 仍显示 page=1。因此必须按自己请求的页码递增至实际空页，不以 total/nextPage 或短页提前结束。这是分页抽样验证，不是全量历史导出。
- `get_work_item_workflow` 返回 `403: Current token has no permission to api.`，只证明当前认证无该 API 权限。状态统计可按已有结果字段执行旧口径；依赖工作流的状态操作不能宣称已验证。
- 未执行创建/更新工作项、评论写入、成员增删、MR 批准/合并或流水线重试。相关写能力只核对了参数 schema，不能报告真实写入已验证。

## 执行入口

公共工具、分页、文件处理与能力缺失处理规则见 [公共说明](common.md)。本文只保存能力对照与验证证据，不另维护一套执行规则。
