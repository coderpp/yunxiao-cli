---
name: release-software-version
description: Use when a technical lead wants to publish a product version by creating Yunxiao release merge requests for syjc-boot and syjc-web.
---

# 检测软件版本发布

## 目标

帮助技术负责人快速发布产品版本，自动创建发布合并请求，并按用户要求决定是否自动评审和合并。

## 固定命令前缀

所有命令都必须用 npx 方式运行：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

## 仓库范围

只发布以下仓库：

- `syjc-boot`
- `syjc-web`

不要发布其他仓库。

## 分支规则

两个仓库分支管理方式一致：

- 开发分支：`master`
- 标准版发布分支：`release`
- 蜀道版本发布分支：`sdjt/dev`
- 商混版本发布分支：`gx-concrete/dev`

发布版本时，`master` 永远不能作为目标分支。

## 操作流程

根据用户要求选择目标分支，并对 `syjc-boot`、`syjc-web` 两个仓库都执行发布。

如果用户要求“发布所有版本”，执行顺序必须是：

1. 商混版：`gx-concrete/dev`
2. 蜀道版：`sdjt/dev`
3. 标准版：`release`

标准版必须最后发布。

默认创建发布合并请求后会自动评审并合并：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release <repositoryName> master <targetBranch> --yes --output json
```

如果用户要求“只发起”“只创建”“不合并”“先不要合并”，必须加 `--create-only`：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release <repositoryName> master <targetBranch> --yes --create-only --output json
```

## 版本类型命令

### 标准版

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-boot master release --yes --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-web master release --yes --output json
```

### 商混版

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-boot master gx-concrete/dev --yes --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-web master gx-concrete/dev --yes --output json
```

### 蜀道版

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-boot master sdjt/dev --yes --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-web master sdjt/dev --yes --output json
```

## 只发起不合并示例

标准版只创建发布合并请求：

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-boot master release --yes --create-only --output json
npx --yes --package @coderpp/yunxiao-cli yunxiao mr release syjc-web master release --yes --create-only --output json
```

## 停止条件

遇到以下情况必须停止，不要继续执行后续仓库，并询问用户：

- API 返回冲突、权限不足、保护分支限制、创建失败、评审失败或合并失败。
- 用户要求的版本类型无法映射到明确目标分支。
- 用户要求把 `master` 作为目标分支。
- 用户要求发布 `syjc-boot`、`syjc-web` 之外的仓库。

以下情况不算异常，记录为“跳过”后继续后续仓库或版本：

- 云效返回“源分支相对目标分支没有改动，不能新建代码评审”。
- 同义错误：源分支相对目标分支无改动、no changes、nothing to merge。

## 汇报要求

运行完成后汇报：

- 版本类型和目标分支。
- 每个仓库的执行结果。
- 被跳过的仓库和跳过原因。
- 是否使用了 `--create-only`。
- 如果失败，说明失败仓库、失败步骤和错误信息。
