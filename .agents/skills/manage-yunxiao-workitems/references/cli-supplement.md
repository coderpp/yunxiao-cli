# CLI 补充能力

仅用于顶层计划完成时间、Projex 项目成员、指定工作项评论回复、关闭 MR、取消整次流水线，以及已有离线下载/脚本封装或用户明确要求 CLI。使用 Node 包 `@coderpp/yunxiao-cli`，不是其他同名工具。不为 MCP 权限错误自动改走 CLI；MCP 已发起写入但结果未知时，先回读，不能跨工具重发。

CLI 运行时才加载既有凭证，并与命令保持在同一个 shell；每次新 shell 重新加载。按顺序选第一个存在的配置：

```bash
set -a
if [ -f "${HOME}/repos/syjc/.env" ]; then
  source "${HOME}/repos/syjc/.env" || { set +a; exit 1; }
elif [ -f "${HOME}/pp-note/.env" ]; then
  source "${HOME}/pp-note/.env" || { set +a; exit 1; }
elif [ -f "${HOME}/.env" ]; then
  source "${HOME}/.env" || { set +a; exit 1; }
elif [ -f "${HOME}/.zshrc" ]; then
  source "${HOME}/.zshrc" || { set +a; exit 1; }
else
  set +a
  echo "缺少云效 CLI 配置" >&2
  exit 1
fi
set +a
# 在同一个 shell 中紧接本次获授权的 CLI 命令
```

确认必要的 `YUNXIAO_TOKEN/YUNXIAO_ORGANIZATION_ID`、项目范围与本次 MCP 目标一致，缺失时停止。沿用既有 `YUNXIAO_DOMAIN/YUNXIAO_EDITION`；不输出配置、Token 或密钥，不复制凭证到 SYJC 或 CLI 仓库。

```bash
# 系统顶层计划完成时间；其他字段不要顺带更新
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem update <workitemId> --due-date "YYYY-MM-DD HH:mm:ss" --yes --output json

# Projex 项目成员；目标项目和用户 ID 必须明确
npx --yes --package @coderpp/yunxiao-cli yunxiao project members <projectId> --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao project member-add <projectId> --user-ids <userId1,userId2> --role-id project.participant --yes --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao project member-remove <projectId> --user-ids <userId1,userId2> --role-id project.participant --yes --output json

# 定向回复；文件仅包含用户授权发送的正文，需要 CLI >= 0.2.0
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem comment <workitemId> --parent-id <commentId> --content-file <reply.md> --yes --output json
```

每次只执行当前任务对应命令；写操作须已有用户授权，结果需回读。参数以当前 CLI help 为准；现有 CLI 的项目成员列表接口无分页参数，读取完整返回，不追加不支持的分页选项。CLI 的普通查询、发布、重试不再作为默认路径。不要为追平官方 MCP 增加重复 API 命令；必要缺口以实际工具 schema 为准，官方补齐并验证后可移除相应补充指引。


## 其他已确认缺口

以下操作必须由用户单独明确要求，不属于“查看 MR”“发布版本”或“重试失败任务”的隐含动作。

```bash
# 关闭指定 MR；先通过 MCP 读取并确认仓库、localId、当前状态
npx --yes --package @coderpp/yunxiao-cli yunxiao mr close <repositoryId> <localId> --yes --output json

# 取消整次流水线运行；停止某个 job 不等于取消整个 run
npx --yes --package @coderpp/yunxiao-cli yunxiao pipeline cancel <pipelineId> <pipelineRunId> --yes --output json
```

关闭 MR 后用 `get_change_request` 核对状态；取消运行后用 `get_pipeline_run` 核对状态，不把已提交请求当成已完成。

## 已有文件与脚本封装

日常阅读使用 MCP；用户需要完整内容包或批量下载时，保留现有 CLI 的下载、去重、图片引用替换与不覆盖文件行为：

```bash
# 在已加载既有配置的同一个 shell 执行，使用新的空目录
CONTENT_DIR="$(mktemp -d /tmp/yunxiao-content.XXXXXX)"
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem content "<云效工作项链接>" --dir "$CONTENT_DIR" > "$CONTENT_DIR/content.json"
```

默认下载正文/评论图片。普通附件仅在用户要求或是当前阅读必需资料时增加 `--download-attachments`。实际打开图片、附件后才称为已阅读；部分失败不称完整成功。不要在做完 MCP 全量下载后重复运行同一内容包。

原有 Shell 自动化、固定 JSON/退出码、profile、`mr release --resume` 等命令继续保留；仅在用户明确选择 CLI 或既有脚本任务需要时使用。恢复发布必须先读取服务端状态，并遵守版本发布技能的目标分支、快照核验及不删除 master 规则，不能借补充路径跳过业务门禁。
