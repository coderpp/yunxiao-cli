---
name: retry-failed-yunxiao-pipelines
description: Use when a technical lead wants to find recent failed Yunxiao pipeline runs, keep only the latest failed run per pipeline, inspect failed jobs, and retry failed Yunxiao pipeline tasks.
---

# 重试失败流水线

## 目标

帮助技术负责人快速定位最近失败的云效流水线运行实例，并重试失败任务。默认只关注最近 24 小时内的失败运行；同一个流水线只保留最新一次失败运行实例。

## 运行前置：加载 `.env`

所有云效 CLI 命令运行前，必须先在根目录加载 `.env`，且加载动作必须和实际命令在同一个 shell 中；如果每次用新的 shell 调用，就每次都重新加载。

```bash
set -a
source .env
set +a
npx --yes --package @coderpp/yunxiao-cli yunxiao <command>
```

`.env` 不存在、加载失败或必要的 `YUNXIAO_*` 环境变量缺失时，停止并提示用户。不要打印 `.env` 内容、token 或其他密钥。

## 固定命令前缀

默认用 npx 方式运行 CLI：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

如果是在 `yunxiao-cli` 仓库内验证尚未发布的新流水线命令，可临时使用本地构建：

```bash
node dist/src/index.js
```

## 查询规则

当用户要求“查询失败流水线”“当前失败流水线”“最近失败流水线”“重试失败流水线”时：

- 默认查询最近 24 小时。
- 只查询失败状态。
- 同一个流水线只保留最新一次失败运行实例。
- 按失败运行开始时间倒序汇报。
- 如果用户明确指定时间范围，按用户时间范围执行；否则不要扩大到 24 小时以外。

使用 CLI 查找候选失败运行实例：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao pipeline failed-runs --hours 24 --output json
```

命令依赖环境变量：

```bash
YUNXIAO_TOKEN
YUNXIAO_ORGANIZATION_ID
YUNXIAO_DOMAIN
YUNXIAO_EDITION
```

其中 `YUNXIAO_DOMAIN` 默认 `openapi-rdc.aliyuncs.com`，`YUNXIAO_EDITION` 默认 `center`。

## 查询后汇报

如果用户只要求查看，不要重试。汇报至少包含：

- 查询时间范围。
- 总数。
- 流水线名称、`pipelineId`、`pipelineRunId`、触发方式、开始时间、结束时间。
- 明确说明“同一个流水线只保留最新一次失败运行实例”。

## 重试流程

1. 先按查询规则获取候选列表。
2. 根据用户指定的流水线名称或 `pipelineId` 唯一定位一条候选失败运行实例。
3. 查询该运行实例详情，找出失败任务：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao pipeline run <pipelineId> <pipelineRunId> --output json
```

4. 从返回结果中筛选 `stages[].stageInfo.jobs[]` 里 `status` 为 `FAIL` 的任务，读取 `id` 作为 `jobId`。
5. 对每个失败任务执行重试：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao pipeline retry-job <pipelineId> <pipelineRunId> <jobId> --yes --output json
```

6. 重试后再次查询运行实例详情，确认运行状态：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao pipeline run <pipelineId> <pipelineRunId> --output json
```

## 停止条件

遇到以下情况必须停止并询问用户：

- 最近 24 小时内没有失败运行实例。
- 用户指定的流水线无法匹配，或匹配到多条候选流水线。
- 运行实例详情中没有失败任务。
- API 返回权限不足、参数错误、流水线不存在、运行实例不存在或任务不存在。
- 重试命令返回失败。

## 汇报要求

重试完成后汇报：

- 被重试的流水线名称、`pipelineId`、`pipelineRunId`。
- 被重试任务的 `jobId`、任务名称、阶段名称。
- 每个任务的重试结果。
- 重试后运行实例状态，例如 `RUNNING`、`SUCCESS` 或 `FAIL`。
- 如果失败，附上关键错误信息和 requestId。
