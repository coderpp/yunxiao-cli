---
name: yunxiao-workitem-stats
description: 统计云效人员最近一个月（或一周）的待办和已完成工作项数量，生成带明细的统计报告并保存到 vault。触发词：工作项统计、统计工作项、统计待办、人员待办统计、工作项月报、统计已完成、工作项周报
---

# 云效工作项统计

## 目标

一键统计团队成员最近一个月的待办和已完成工作项数量，按人员分组生成统计报告，包含总览表和待办明细列表，并自动保存到 `outputs/工作项统计/` 目录。

## 触发词

工作项统计、统计工作项、统计待办、人员待办统计、工作项月报、工作项周报、统计已完成

## 运行前置：加载 `.env`

所有云效 CLI 命令运行前，必须先在根目录加载 `.env`，且加载动作必须和实际命令在同一个 shell 中；如果每次用新的 shell 调用，就每次都重新加载。

```bash
set -a
source .env
set +a
npx --yes --package @coderpp/yunxiao-cli yunxiao <command>
```

`.env` 不存在、加载失败或必要的 `YUNXIAO_*` 环境变量缺失时，停止并提示用户。不要打印 `.env` 内容、token 或其他密钥。

## 前置条件

确认以下环境变量已设置，缺少任何一个则停止并提示用户：

- `YUNXIAO_TOKEN`
- `YUNXIAO_ORGANIZATION_ID`
- `YUNXIAO_PROJECT_IDS`

## 固定命令前缀

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao
```

## 执行流程

### 第 1 步：计算时间范围

根据用户指定的时间范围计算，默认为最近 1 个月。macOS/zsh：

**最近 1 个月**（默认）：

```bash
START="$(date -v-1m '+%Y-%m-%d 00:00:00')"
END="$(date '+%Y-%m-%d 23:59:59')"
```

**最近 1 周**：

```bash
START="$(date -v-1w '+%Y-%m-%d 00:00:00')"
END="$(date '+%Y-%m-%d 23:59:59')"
```

时间范围说明：
- 用户未指定时，默认使用"最近 1 个月"
- 用户提到"最近一周""本周""近 7 天"等，使用"最近 1 周"
- 用户提到"最近一个月""本月""近 30 天"等，使用"最近 1 个月"

### 第 2 步：查询待办工作项

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state todo --from "$START" --to "$END" --date-field gmtModified --all-pages --output json
```

### 第 3 步：查询已完成工作项

```bash
npx --yes --package @coderpp/yunxiao-cli yunxiao workitem list --state done --from "$START" --to "$END" --date-field gmtModified --all-pages --output json
```

### 第 4 步：数据处理

1. **排除产品同事**（除非用户明确要求包含）：
   - 蒋鹏、李莎仕、刘志鹏、罗宇辉、顾宝程、刘远航

2. **按负责人分组统计**：
   - 待办数量
   - 已完成数量
   - 合计

3. **待办明细按负责人分组排序**（数量降序）

### 第 5 步：生成文档

保存到 `outputs/工作项统计/工作项统计 YYYY-MM-DD.md`（使用当天日期）。

如果目录不存在，自动创建。

## 输出文档结构

### Frontmatter

```yaml
---
title: 云效工作项统计
date: YYYY-MM-DD
tags:
  - 云效
  - 工作项
  - 统计
type: output
query_range: "YYYY-MM-DD ~ YYYY-MM-DD"
excluded_members:
  - 蒋鹏
  - 李莎仕
  - 刘志鹏
  - 罗宇辉
  - 顾宝程
  - 刘远航
---
```

### 文档正文

```markdown
# 云效工作项统计（YYYY-MM-DD ~ YYYY-MM-DD）

> 查询条件：最近 N 个月/周有更新的工作项，按更新时间过滤。已排除产品同事（蒋鹏、李莎仕、刘志鹏、罗宇辉、顾宝程、刘远航）。

## 总览

| 负责人 | 待办 | 已完成 | 合计 |
|--------|------|--------|------|
| 张三   | 10   | 20     | 30   |
| ...    | ...  | ...    | ...  |
| **合计** | **N** | **N** | **N** |

---

## 待办明细

### 张三（N 条）

| 编号 | 标题 | 类型 | 优先级 | 计划完成 | 项目 | 更新时间 |
|------|------|------|--------|----------|------|----------|
| [XXX-123](链接) | 标题 | 任务 | 高 | 2026-05-01 | 项目名 | 04-29 |

### 李四（N 条）

...

---

> 本文档由 Claudian 自动生成于 YYYY-MM-DD，数据来源：云效 API
```

### 明细字段映射

| 文档字段 | 数据来源 |
|----------|---------|
| 编号 | `serialNumber`，带链接 |
| 标题 | `subject` |
| 类型 | `workitemType.name` |
| 优先级 | `customFieldValues` 中 `fieldId` 为 `priority` 或 `fieldName` 为"优先级"，取 `values[].displayValue` |
| 计划完成 | 优先 `dueDate`/`planFinishTime`/`plannedFinishTime`/`expectedFinishTime`；否则查 `customFieldValues` 中包含"计划完成""截止""到期"的字段 |
| 项目 | `space.name` |
| 更新时间 | `gmtModified`，格式 `MM-DD` |

### 链接生成

优先使用返回数据中的 `detailUrl`、`webUrl` 或 `url`；如果接口未返回链接，用以下格式生成：

```
https://devops.aliyun.com/projex/project/<space.id>/<category-route>/<id>
```

`category-route` 按 `categoryId` 映射：`Req` → `req`，`Task` → `task`，`Bug` → `bug`，其他值使用小写形式。

## 汇报要求

执行完成后，在对话中展示：

1. **统计摘要**：总览表（人员 × 待办/已完成/合计）
2. **关键发现**：
   - 待办积压最多的人员
   - 完成量最高的人员
   - 其他值得关注的模式（如某项目集中爆发等）
3. **文档位置**：告知用户文档已保存的路径（wikilink 格式）

## 停止条件

- 环境变量缺失
- API 返回权限不足或查询失败
- 用户要求包含产品同事时，在命令中不加排除逻辑，但在文档中说明

## 示例对话

用户：帮我统计一下工作项（默认最近 1 个月）
用户：工作项月报（最近 1 个月）
用户：工作项周报（最近 1 周）
用户：统计待办（默认最近 1 个月）
用户：统计最近一周的工作项（最近 1 周）

执行流程：
1. 确认环境变量
2. 计算时间范围
3. 查询待办 + 已完成
4. 排除产品同事，按人员分组
5. 生成文档到 `outputs/工作项统计/`
6. 展示统计摘要
