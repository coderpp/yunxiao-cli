# @coderpp/yunxiao-cli

用于评审和合并云效 Codeup 合并请求的命令行工具。

## 安装

```bash
npm install
npm run build
```

本地运行：

```bash
node dist/src/index.js --help
```

如果后续发布为 npm 包，安装后可直接使用 `yunxiao` 命令。

## 通过 npx 使用

发布到 npm 后，可以直接用 `npx` 执行：

```bash
npx @coderpp/yunxiao-cli mr list --state opened
```

也可以指定版本：

```bash
npx @coderpp/yunxiao-cli@0.1.4 mr list --output json
```

包内的可执行命令名仍然是 `yunxiao`，全局安装后可这样使用：

```bash
npm install -g @coderpp/yunxiao-cli
yunxiao mr list --state opened
```

## CI/CD

仓库包含两个 GitHub Actions 工作流：

- `CI`：在 pull request 和 `main` 分支 push 时运行 `npm ci`、`npm test`、`npm run pack:dry-run`。
- `Publish`：在推送 `v*.*.*` tag 或手动触发时发布 npm 包。

自动发布使用 npm Trusted Publishing，不需要在 GitHub 保存长期 npm token。npm 包设置中需要配置 Trusted Publisher：

- Provider：GitHub Actions
- Organization or user：`coderpp`
- Repository：`yunxiao-cli`
- Workflow filename：`publish.yml`
- Environment name：留空

Trusted Publishing 要求发布环境使用 npm CLI 11.5.1 或更高版本，workflow 的发布 job 使用 Node.js 24。

发布新版本的流程：

```bash
npm version patch
git push origin main --follow-tags
```

如果手动创建 tag，需要确保 tag 和 `package.json` 版本一致，例如：

```bash
npm version 0.1.1
git push origin main v0.1.1
```

## 配置

不要把个人访问令牌写入代码或提交到仓库。建议通过环境变量提供：

```bash
export YUNXIAO_TOKEN="pt-..."
export YUNXIAO_DOMAIN="openapi-rdc.aliyuncs.com"
export YUNXIAO_ORGANIZATION_ID="your-organization-id"
export YUNXIAO_EDITION="center"
```

说明：

- 中心版默认使用 `openapi-rdc.aliyuncs.com`，并需要 `YUNXIAO_ORGANIZATION_ID`。
- Region 版设置 `YUNXIAO_EDITION=region`，通常不需要组织 ID。
- 也可以用命令参数覆盖配置：`--token`、`--domain`、`--organization-id`、`--edition`。

## 命令

查询合并请求列表：

```bash
node dist/src/index.js mr list --state opened --project-ids 2813489 --per-page 20
```

输出 JSON：

```bash
node dist/src/index.js mr list --state opened --output json
```

评审通过指定合并请求：

```bash
node dist/src/index.js mr review 2813489 12 --comment "LGTM"
```

合并指定合并请求：

```bash
node dist/src/index.js mr merge 2813489 12 --yes
```

评审通过并合并：

```bash
node dist/src/index.js mr approve-and-merge 2813489 12 --yes --merge-type squash --remove-source-branch
```

查询变更文件树：

```bash
node dist/src/index.js mr tree 2813489 12 \
  --from-patch-set-id target-version-id \
  --to-patch-set-id source-version-id
```

查询版本列表：

```bash
node dist/src/index.js mr patches 2813489 12
```

## 输出格式

所有会输出 API 结果的命令都支持 `--output`：

```bash
node dist/src/index.js mr list --output table
node dist/src/index.js mr list --output json
node dist/src/index.js mr review 2813489 12 --output table
node dist/src/index.js mr patches 2813489 12 --output json
```

支持的格式：

- `table`：普通表格文本，默认值。
- `json`：格式化 JSON。

`--json` 仍然可用，等价于 `--output json`。

## 参数补充

`repositoryId` 可以是代码库 ID，也可以是仓库完整路径，工具会自动做 URL 编码。

会改变仓库状态的命令需要 `--yes`：

- `mr merge`
- `mr approve-and-merge`

这是为了避免误合并。

未指定 `--merge-type` 时，默认使用 `no-fast-forward`。
