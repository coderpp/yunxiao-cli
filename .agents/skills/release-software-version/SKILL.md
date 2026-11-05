---
name: release-software-version
description: 使用云效官方 MCP 为 syjc-boot、syjc-web 创建版本发布 MR，并按既有发布授权评审及合并；支持标准版、蜀道版、商混版，以及只创建不合并。
---

# 检测软件版本发布

## 使用前与发布范围

先读 [公共说明](../manage-yunxiao-workitems/references/common.md)，统一组织、仓库定位、分页与写入结果确认。下文省略官方 MCP 客户端工具前缀。

只发布 `syjc-boot`、`syjc-web`。按公共说明取得两个仓库的真实 `repositoryId`，不要发布其他仓库。

| 版本 | 源分支 | 目标分支 |
|---|---|---|
| 商混版 | master | gx-concrete/dev |
| 蜀道版 | master | sdjt/dev |
| 标准版 | master | release |

`master` 永远不能作为发布目标。“发布所有版本”按商混、蜀道、标准顺序，每个版本都处理两个仓库，标准版最后。

## 发布流程

用户说“发布某版本”沿用既有语义：创建发布 MR、批准并合并；“只发起 / 只创建 / 不合并 / 先不要合并”仅创建。此次技能维护本身不构成发布授权。

1. 用 `list_change_requests` 查询目标仓库的 opened MR，逐页核对同一源库、目标库、源分支和目标分支。无匹配才创建；唯一匹配时读取详情，确认属于本次发布后复用；多个匹配时停止并消歧，避免重复创建。
2. `create_change_request` 传 `organizationId/repositoryId/title/sourceBranch/targetBranch`，标题描述本次版本发布，描述使用完整结构化字符串。源/目标项目 ID 仅按真实仓库信息提供。不额外触发 AI 评审。
3. 取得 `localId` 和真实 MR 链接后立即按当前宿主要求关联 MR。只创建模式在此结束，不批准、不合并。
4. 用 `get_change_request` 与 `list_change_request_patch_sets` 核对状态、分支及两端最新 `patchSetBizId/commitId/ref`。分别按 `MERGE_SOURCE/MERGE_TARGET` 的数值 `versionNo` 取最新记录。缺失或冲突时停止。
5. 在既有发布授权内调用 `review_change_request(reviewOpinion="PASS")`。不要提交无关草稿评论；需评论时仅写本次发布事实。
6. 批准后再次读取详情与两端补丁集；源或目标快照变化时停止，旧批准不能当作新版本已核验。`allRequirementsPass`、冲突检查和分支保护不允许绕过。
7. `merge_change_request` 显式传 `mergeType="no-fast-forward"`、`removeSourceBranch=false`，保留发布源分支 `master`。用户明确指定合并方式时按用户要求，但不能删除 `master`。
8. 用 `get_change_request` 回读状态，只有确认 merged 才报告已合并。MR 合并不等于流水线成功或生产已更新。

MCP 没有 `mr release` 一键命令，上述多步流程由技能组织，不能省略查重、快照校验和结果回读。[能力对照](../manage-yunxiao-workitems/references/official-mcp-coverage.md) 记录迁移验证与限制。

## 无差异、恢复与停止

- 服务端明确返回“源分支相对目标分支没有改动 / no changes / nothing to merge”时，记录跳过并继续下一仓库或版本。
- 创建结果未知：查询同源目标的 MR，确认服务端结果；禁止直接再次创建。
- 批准或合并结果未知：回读详情、评审状态及补丁集，记录已完成步骤。已 merged 直接记录；仍无法判断时停止，不盲目重发写操作。
- API 冲突、权限不足、保护分支限制、明确创建/批准/合并失败时停止后续发布，说明失败步骤。不能把这些错误当作“无差异”。
- 版本无法映射、目标为 master、请求其他仓库或匹配不唯一时，先请用户澄清。

## 汇报

列出版本、目标分支、每仓库 MR 链接及创建/批准/合并/跳过状态，说明是否仅创建；失败时给出步骤及关键错误。流水线、部署、生产效果分别报告其实际验证状态。
