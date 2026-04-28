---
name: check-software-merge-requests
description: Use when a technical lead wants to inspect, approve, and merge open Yunxiao merge requests for the allowed software repositories syjc-boot and syjc-web.
---

# 检测软件合并请求

## 目标

帮助技术负责人快速处理同事提交的待合并请求，减少重复操作，提高合并效率。

## 固定命令前缀

所有命令都必须用 npx 方式运行：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

## 仓库白名单

只处理以下仓库：

- `syjc-boot`
- `syjc-web`

忽略其他仓库的合并请求，即使它们也出现在待合并列表中。

## 操作流程

1. 获取所有待合并请求：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr list --state opened --output json
```

2. 从结果中筛选仓库属于 `syjc-boot`、`syjc-web` 的请求。

3. 根据用户要求处理：

- 如果用户只要求“查看”“看下”“不合并”，只汇报待合并请求，不执行任何评审或合并命令。
- 如果用户指定某个请求，只处理指定请求。
- 如果用户要求处理所有请求，只处理白名单仓库中的所有请求。

4. 对每个要处理的请求执行评审通过并合并，默认删除源分支：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr approve-and-merge <repositoryId> <localId> --yes --remove-source-branch --output json
```

5. 汇报合并结果，至少包含：

- 如果只是查看：列出待处理请求，明确说明未执行合并。
- 已合并请求列表：仓库、合并请求 ID、标题或源/目标分支。
- 已忽略请求列表：说明因为仓库不在白名单而忽略。
- 失败或停止原因。

## 停止条件

遇到以下情况必须停止，不要继续处理后续请求，并询问用户：

- API 返回冲突、权限不足、保护分支限制、合并失败。
- 待处理请求的仓库无法确认是否属于白名单。
- 用户要求和检测到的请求不一致，例如指定请求不存在。
- 命令输出中出现异常状态或错误信息。

## 注意

- 合并操作必须带 `--yes`。
- 合并操作默认带 `--remove-source-branch`。
- 不要合并 `syjc-boot`、`syjc-web` 之外的任何仓库。
- 不要在异常后自行重试破坏性操作；先汇报并询问用户。
