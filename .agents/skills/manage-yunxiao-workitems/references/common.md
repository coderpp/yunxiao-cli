# 云效技能公共说明

使用任一云效业务技能前读取本文件；同一任务只需读取一次。业务技能决定查询口径、目标范围和写入授权；本文件统一工具、认证、分页与结果处理。能力与已验证范围见 [功能对照](official-mcp-coverage.md)。

## 工具选择与认证

- 只使用云效官方 `alibabacloud-devops-mcp-server`。当前工具前缀为 `mcp__yunxiao__`，业务技能省略前缀；按当前客户端实际注册名称和 schema 调用。
- MCP 使用客户端已有认证，不加载本地 Token，不因日常调用改写客户端配置。当前工具未暴露时先说明缺失；不切换凭证、CLI 或自行调用云效 HTTP API 绕过。
- `organizationId` 优先使用用户明确指定值；否则读取 `get_current_organization_info` 的 `lastOrganization`。与已有任务目标不一致时先核实，不跨组织。当前用户 ID 用 `get_current_user`。
- 姓名用 `search_organization_members` 或分页 `list_organization_members` 解析为用户 ID；同名或未匹配时消歧。组织成员不等于项目成员。
- 缺少对应工具或参数时，说明当前能力限制，停止依赖该能力的操作；继续可独立完成的已授权部分。不提供 CLI 补充或回退路径。正文、图片、附件与离线内容包均通过 MCP 取得数据和下载地址，再用本地文件工具读取、整理；文件下载不属于另建云效 API 调用入口。

## 范围配置与对象标识

仅为读取非秘密的项目范围或类别配置，依次检查 `~/repos/syjc/.env`、`~/pp-note/.env`、`~/.env`、`~/.zshrc`，采用第一个存在的配置文件。不要输出整个文件或复制凭证；MCP 的认证独立于这些范围配置。

- 工作项管理以 `YUNXIAO_PROJECT_IDS` 限定项目；统计技能另外合并笔记库 `_系统/技能数据/云效关注项目.md`，按该技能执行。范围缺失或用户目标超出范围时先确认，不能默认扫描全组织。
- 链接里的项目 ID 与详情 `space.id` 必须一致。逐项目使用 `spaceId`，不能拼接多个项目 ID。
- Projex 项目 ID 与 Codeup 仓库 ID 不互通。MR 用 `(repositoryId,localId)` 唯一定位，列表中的 `projectId` 是代码库 ID；先通过 `list_repositories` 核对名称和路径，不取模糊搜索第一条。
- 流水线任务用 `(pipelineId,pipelineRunId,jobId)` 定位；重试、重跑、停止单任务、取消整次运行不能混同。

## 分页与返回值

先识别实际返回结构：可能是数组，或 `items + pagination`。保存必要的原始证据；工具返回错误或 `isError` 时不能当作空列表。按稳定 ID 去重，失败页和重复页要标明不完整。

| 对象 | 分页规则 |
|---|---|
| 工作项 | `perPage<=200`，`page * perPage<=10000`；达到上限按日期或已确认类别拆分，核验边界与覆盖 |
| MR、仓库、成员、工作项评论 | 按当前工具 schema 分页；无可信总数时递增到实际空页。无分页参数的接口读取完整返回，不能自造分页参数 |
| 流水线及运行 | `perPage<=30`，自己维护请求页码，固定页大小，递增至实际空页；不能因短页、`nextPage=null`、`total=0` 或回传 page 停止 |

流水线规则来自实际验证：非空第一页显示无下一页，第二页仍有不同数据。重复整页或请求错误时停止，避免无限循环；不能据此报告“全部查询完成”。统计和导出记录实际覆盖范围，不假设运行 ID 连续。

## 工作项查询

逐项目调用 `search_workitems`，传 `organizationId`、`spaceId`、`spaceType="Project"`。不要把多个项目 ID 拼成一个 `spaceId`。

| 需求 | 参数或处理 |
|---|---|
| 当前用户 | `assignedTo="self"`；需要明确用户 ID 时用 `get_current_user` |
| 指定负责人 / 创建人 | `assignedTo` / `creator`，多个用户 ID 逗号分隔 |
| 类型 | `category` 是必传字符串；沿用 `YUNXIAO_WORKITEM_CATEGORIES`，未配置时为 `Req,Task,Bug`，不擅自缩减为单一类型 |
| 明确要求所有类型 | 先用 `list_work_item_types` 核对项目类型及类别，再覆盖查询；枚举受限时说明已查类别，不能宣称全类型 |
| 标题 / 正文关键词 | `subject` / `subjectDescription` |
| 创建日期 | `createdAfter` / `createdBefore` |
| 更新日期 | `updatedAfter` / `updatedBefore` |
| 正文详情 | `includeDetails=true`；单条完整字段用 `get_work_item` |

日期参数为 `YYYY-MM-DD`。按北京时间计算用户范围；精确到时分秒的范围先扩大日期查询，再按返回的 `gmtCreate` / `gmtModified` 毫秒值本地过滤。默认按创建时间；用户指定更新时间时才切换。

完整列表按上文分页规则读取，以工作项 `id` 去重；不能通过盲目增加页码绕过深分页上限。无法继续拆分时报告不完整，不将部分结果当作全量。

状态技术映射（是否合并 todo 与 doing 由业务技能决定）：

- 按 `status.nameEn/name/displayName` 分类：todo 对应 `TODO/待处理/待办`；doing 对应 `DOING/IN_PROGRESS/PROCESSING/进行中/处理中`；done 对应 `DONE/COMPLETED/CLOSED/已完成/完成/已关闭`。保持这一口径，不把所有非 done 状态自动算作 todo。
- MCP 的 `status` 是状态 ID，`statusStage` 是阶段 ID，不能填 `todo/doing/done`。已有可靠工作流映射时可服务端过滤；否则读取完整结果后按上述口径本地过滤。
- `get_work_item_workflow` 可核对项目实际状态；权限不足时不得猜测固定状态或阶段 ID。未知状态保留并说明分类缺口；需要业务重新归类时由用户确定。

## 写入与结果确认

- 按业务技能识别查看、评审、修改、发布、重试等意图；仅查看和评审不授权远端批准、评论或合并。既有明确授权足够时直接执行，不重复索要确认。
- 工具可调用不等于当前账号有权限。403 需说明具体受限接口，继续独立的已授权只读部分；不要猜测缺失字段或扩大范围。
- 只更新用户要求的字段。评论、MR 描述等长文本用结构化字符串；文件输入先读取原文。
- 写入超时或结果未知时，先回读对象状态再决定后续步骤；不能盲目重发同一写入。创建操作查重，阶段失败保留已完成状态。
- 回读后报告真实结果。MR 已合并、流水线已启动、部署已成功、生产效果已验证是不同状态。只核对 schema 不能声称真实写入已验证。
- Token、连接串和临时签名下载 URL 不进入说明、报告或持久日志；对象存储下载不携带云效 PAT。

## 文件与单源维护

五个云效业务技能源文件统一维护于 `~/repos/tool/yunxiao-cli/.agents/skills/`。SYJC 的同名目录使用实体副本，不使用软链接。修改源后运行 `npm run skills:sync` 复制更新，运行 `npm run skills:check` 核对一致性；SYJC 可直接使用已有副本，无需依赖源仓库在线或存在。若副本有独立修改，同步前先比较并合并回源，避免丢失修改意图。

`review-branch-changes` 保持在 SYJC 工作区，负责 Git 代码评审及主分支隔离红线，MR 技能按路径读取。普通分支评审不需要云效公共规则；MR 模式需要。

公共文档放在本目录，业务技能通过相对链接引用；不要新建仅用于转发的技能。笔记库数据仍在 `~/pp-note`；运行快照写 `_系统/日志/`，临时文件使用本次独占目录，人工分析按主题或项目保存。
