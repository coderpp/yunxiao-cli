---
name: retry-failed-yunxiao-pipelines
description: 使用云效官方 MCP 查询近期失败流水线、按流水线保留最新失败运行、读取失败任务和日志，并在用户要求重试时重试失败任务。
---

# 重试失败流水线

## 工具与查询口径

先读 [公共说明](../manage-yunxiao-workitems/references/common.md)，统一认证、组织、流水线分页与写入结果确认。下文省略官方 MCP 客户端工具前缀。

- 默认最近 24 小时，按北京时间固定本次起止时刻，接口时间参数使用毫秒时间戳。
- 同一流水线仅保留时间范围内最新一条失败运行，按失败运行开始时间倒序。
- 用户指定时间、流水线名称或 ID 时按指定范围，不扩大查询时段。
- “查询 / 查看”只读；只有用户明确要求重试才执行写操作。

## 获取失败运行

1. 用 `list_pipelines` 分页取得范围内流水线。可用名称和执行时间筛选，但不能仅用 `statusList="FAIL"` 代替历史失败查询：最新运行成功的流水线仍可能在指定时段内失败过。
2. 对候选流水线调用 `list_pipeline_runs`，传 `pipelineId`、`status="FAIL"`、`startTime/endTime`。本地再按运行 `startTime` 核对时间范围，去除越界记录。
3. 分页读取全部候选后按 `(pipelineId,pipelineRunId)` 去重，每条流水线选 `startTime` 最大的失败运行。

完整分页遵循公共说明中的流水线规则；不能依据 `nextPage/total` 或短页提前停止。

历史运行导出同样使用该分页规则，记录去重数量和实际空页，不要求运行 ID 连续。接口只有 `creatorAccountId` 时保留 ID，不能编造姓名。

## 查看失败任务和日志

- `get_pipeline_run(organizationId,pipelineId,pipelineRunId)` 返回运行详情，从 `stages[].stageInfo.jobs[]` 读取真实任务结构，筛选 `status="FAIL"`，任务 `id` 用作 `jobId`。
- 日志用 `get_pipeline_job_run_log`。需要完整分步日志时先 `get_pipeline_job_steps`，再按返回的 `stepIndex/buildId` 调用 `get_pipeline_job_step_log`，使用 `offset/limit` 读取后续片段。
- 单次日志快照不保证完整；检查截断或后续标记。日志中的凭证不进入汇报。

## 重试

1. 将用户要求与候选唯一匹配，读详情确认仍存在失败任务。
2. 执行前检查是否已有更新运行；如后续已成功或仍在运行，说明情况，避免自动重试旧版本部署。
3. 每个获授权的失败任务调用 `retry_pipeline_job_run`，参数为 `organizationId/pipelineId/pipelineRunId/jobId`。每个任务本次只提交一次。
4. 再用 `get_pipeline_run` 回读状态。`RUNNING` 只表示已进入执行，不等于成功；失败要记录错误与 requestId。

`rerun_pipeline_job_run` 是部署任务重跑，不等同于失败任务重试。`create_pipeline_run`、取消、跳过和人工审批也不在重试授权内。用户另行明确要求取消整次运行时，检查当前官方 MCP 是否提供对应工具；缺失时说明限制并停止取消操作，不改用 CLI，不能以停止单个 job 代替取消整个 run。

重试超时或返回结果未知时，先查运行状态，不自动重复写入。没有失败运行或没有失败任务时报告无需重试并结束；名称歧义、权限错误、参数或对象错误时停止相关操作。明确重试失败时停止后续写操作并汇报。

## 汇报

查询说明时间范围、最新失败实例口径和分页完整性；列出流水线名称、ID、运行 ID、触发方式、开始/结束时间。重试另列任务 ID、任务/阶段名称、提交结果及回读状态。

迁移依据与已验证范围见 [能力对照](../manage-yunxiao-workitems/references/official-mcp-coverage.md)。
