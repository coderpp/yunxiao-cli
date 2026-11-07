# 云效技能与维护入口

本仓库 CLI 代码仍为 `@coderpp/yunxiao-cli`。研发管理技能只使用云效官方 `alibabacloud-devops-mcp-server`；缺少工具、参数或权限时说明限制，不使用 CLI 或自行调用云效 HTTP API 补充。CLI 代码本身不在此次技能维护范围内。

## 技能

匹配名称或触发场景时先读取对应 `SKILL.md`，不只依赖下表摘要。Claude Code 使用同一入口；相对脚本与参考文件路径按技能目录解析。

| 技能 | 触发场景与功能 |
|---|---|
| [manage-yunxiao-workitems](.agents/skills/manage-yunxiao-workitems/SKILL.md) | 工作项查询、正文图片附件、更新、评论与项目成员维护；只使用官方 MCP，能力缺失时说明限制 |
| [yunxiao-workitem-stats](.agents/skills/yunxiao-workitem-stats/SKILL.md) | 工作项统计、人员月报/周报；MCP 分页采集，保留统计口径与笔记库输出 |
| [check-software-merge-requests](.agents/skills/check-software-merge-requests/SKILL.md) | 查看、评审或合并 MR；保留意图路由、提交人范围及精确快照门禁 |
| [release-software-version](.agents/skills/release-software-version/SKILL.md) | 标准/蜀道/商混版本发布；MCP 创建、批准、合并或仅创建发布 MR |
| [retry-failed-yunxiao-pipelines](.agents/skills/retry-failed-yunxiao-pipelines/SKILL.md) | 查询失败流水线、任务日志和授权重试；显式分页校验 |

## 单源与维护边界

- 统一维护源为本仓库 `.agents/skills/`；SYJC 的五个同名目录使用实体副本，不使用软链接。先修改源，再复制同步；若 SYJC 副本有独立修改，先比较并合并回源。
- 共用 [基础说明](.agents/skills/manage-yunxiao-workitems/references/common.md)：认证、范围、对象标识、分页、工作项查询技术映射和写入结果确认。各业务技能只定义自己的任务口径和流程。
- 云效技能不提供 CLI 补充或回退入口。正文、图片、附件通过 MCP 读取与取得下载地址，离线包由本地文件工具整理。能力缺失时停止依赖操作，继续独立的已授权部分。
- `review-branch-changes` 的唯一源仍为 `~/repos/syjc/.agents/skills/review-branch-changes/`。MR 评审依赖它；不可用时不能自动批准或合并。
- `npm run skills:sync` 仅将五个技能复制到 `~/repos/syjc/.agents/skills/`；`npm run skills:check` 只读检查实体副本与源是否一致。可传工作区路径：`npm run skills:sync -- /path/to/syjc`。不同内容在替换前保留到目标 Git 元数据目录的 `skills-copy-backup-*`；相同内容不重写。现有指向本源的软链接会替换为实体目录，其他链接保留并报错。
- 不再运行后台复制 watcher，不向 pp-note、Hermes 或 `.claude/skills/` 写副本，不恢复已移除的技能。
- 技能更新后按 `sync-skill-docs` 维护本文件与 SYJC `AGENTS.md` 的相关说明，不创建或同步 `CLAUDE.md`。保留无关工作区修改。
- 能力证据与验证边界见 [功能对照](.agents/skills/manage-yunxiao-workitems/references/official-mcp-coverage.md)。技能维护不授权真实业务写入、提交、推送或 npm 发布。
