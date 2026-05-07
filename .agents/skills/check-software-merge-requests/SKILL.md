---
name: check-software-merge-requests
description: Use when a technical lead wants to inspect, approve, and merge open Yunxiao merge requests for the default software repositories syjc-boot and syjc-web, or explicitly requested merge requests outside that default scope.
---

# 检测软件合并请求

## 目标

帮助技术负责人快速处理同事提交的待合并请求，减少重复操作，提高合并效率。

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

所有命令都必须用 npx 方式运行：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

## 默认仓库范围

默认只处理以下仓库：

- `syjc-boot`
- `syjc-web`

当用户要求“查看待合并请求”“合并所有请求”“处理全部请求”时，只处理以上仓库，忽略其他仓库的合并请求。

## 白名单外例外

如果用户明确提出白名单外仓库或白名单外合并请求，可以处理。支持两类请求：

- 单独指定某个白名单外仓库或某个具体合并请求。
- 明确要求“合并白名单以外的所有请求”“合并其他仓库的所有请求”“合并除 `syjc-boot`、`syjc-web` 之外的所有请求”。

必须满足：

- 用户明确指定了仓库、合并请求 ID、标题，或明确要求处理白名单外全部请求。
- 单独指定时，只处理用户指定的请求，不要顺带处理同仓库或其他白名单外请求。
- 明确要求处理白名单外全部请求时，只处理白名单外请求，不要同时处理白名单内请求，除非用户也明确要求。
- 汇报时说明这是用户明确要求处理的白名单外请求。

如果用户只是泛泛说“全部合并”“检测所有合并请求”，不要合并白名单外仓库。

## 操作流程

1. 获取所有待合并请求：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr list --state opened --output json
```

2. 根据用户要求筛选请求：

- 默认或“全部合并”：筛选仓库属于 `syjc-boot`、`syjc-web` 的请求。
- 用户单独指定白名单外请求：从结果中定位该指定请求。
- 用户明确要求白名单外全部请求：筛选仓库不属于 `syjc-boot`、`syjc-web` 的请求。

3. 根据用户要求处理：

- 如果用户只要求“查看”“看下”“不合并”，只汇报待合并请求，不执行任何评审或合并命令。
- 如果用户指定某个请求，只处理指定请求；指定请求可以来自白名单外仓库。
- 如果用户要求处理所有请求，只处理白名单仓库中的所有请求。
- 如果用户明确要求处理白名单外所有请求，只处理白名单外仓库中的所有请求。

4. 对每个要处理的请求执行评审通过并合并，默认删除源分支：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr approve-and-merge <repositoryId> <localId> --yes --remove-source-branch --output json
```

5. 汇报合并结果，至少包含：

- 如果只是查看：列出待处理请求，明确说明未执行合并。
- 已合并请求列表：仓库、合并请求 ID、标题或源/目标分支。
- 已忽略请求列表：说明因为仓库不在白名单而忽略。
- 白名单外请求：说明这是用户明确要求后处理的请求，并列出处理范围。
- 失败或停止原因。

## 停止条件

遇到以下情况必须停止，不要继续处理后续请求，并询问用户：

- API 返回冲突、权限不足、保护分支限制、合并失败。
- 待处理请求的仓库无法确认是否属于默认范围，且用户没有单独明确指定该请求。
- 用户要求和检测到的请求不一致，例如指定请求不存在。
- 用户对白名单外单个请求的描述无法唯一定位到一个合并请求。
- 命令输出中出现异常状态或错误信息。

## 注意

- 合并操作必须带 `--yes`。
- 合并操作默认带 `--remove-source-branch`。
- 不要在“全部合并”这类批量操作中合并 `syjc-boot`、`syjc-web` 之外的任何仓库。
- 只有用户明确指定白名单外请求或明确要求合并白名单外全部请求时，才允许合并白名单外仓库。
- 不要在异常后自行重试破坏性操作；先汇报并询问用户。
