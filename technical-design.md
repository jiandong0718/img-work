# 图片归档工作台技术设计草案

## 1. 模块划分

### 1.1 前端模块

- 登录页：账号密码登录、退出登录、会话失效跳转。
- 图片归档：提供 Excel 导入和手动上传两个入口。
- Excel 导入：上传 Excel、字段识别、导入预览、确认入库。
- 手动上传：批量/单张上传图片、逐张补充编号、名称、图片类型、数量。
- 图片中心：统一展示已归档主图，支持搜索、筛选、批量改状态。
- 主图详情：维护主图信息、状态、数量、套图、操作日志。
- 状态看板：按状态分组查看主图。

### 1.2 后端模块

- Auth：登录、退出、当前用户、会话校验。
- User：用户管理，MVP 可仅提供初始化账号。
- Import：Excel 上传、解析、预览、确认入库。
- ManualUpload：手动上传预处理、保存入库。
- ImageItem：主图增删改查、状态修改、数量修改、下载。
- Attachment：套图上传、删除、排序、下载。
- Batch：Excel 导入批次、手动上传批次。
- OperationLog：操作日志写入和查询。
- FileStorage：原图、缩略图、Excel 文件存储。

## 2. 核心数据表

### users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 用户 ID |
| account | string | 登录账号，唯一 |
| display_name | string | 显示名称 |
| password_hash | string | 密码哈希 |
| role | string | admin/member |
| status | string | active/disabled |
| last_login_at | datetime | 最近登录时间 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### image_items

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主图 ID |
| code | string | 编号，唯一 |
| name | string | 名称 |
| type | string | hand_bag/shoulder_bag |
| archive_date | date | 归档日期 |
| main_image_url | string | 原图地址 |
| thumbnail_url | string | 缩略图地址 |
| status | string | 当前状态 |
| required_quantity | int | 需求数量 |
| produced_quantity | int | 已生产数量 |
| remark | string | 备注 |
| source_type | string | excel/manual |
| batch_id | string | 批次 ID |
| last_operator_user_id | string | 最近操作用户 ID |
| last_operator_name | string | 最近操作人 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime | 软删除时间 |

### image_attachments

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 套图 ID |
| image_item_id | string | 主图 ID |
| file_url | string | 原图地址 |
| thumbnail_url | string | 缩略图地址 |
| sort_order | int | 上传顺序 |
| file_name | string | 文件名 |
| operator_user_id | string | 上传用户 ID |
| operator_name | string | 上传人 |
| created_at | datetime | 创建时间 |
| deleted_at | datetime | 软删除时间 |

### import_batches

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 批次 ID |
| file_name | string | Excel 文件名 |
| archive_date | date | 归档日期 |
| default_type | string | 默认图片类型 |
| total_rows | int | 总行数 |
| imported_count | int | 成功入库数 |
| skipped_count | int | 跳过数 |
| duplicate_count | int | 重复编号数 |
| excluded_count | int | 排除关键词数 |
| failed_count | int | 失败数 |
| operator_user_id | string | 导入用户 ID |
| operator_name | string | 导入人 |
| created_at | datetime | 创建时间 |

### manual_upload_batches

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 批次 ID |
| archive_date | date | 归档日期 |
| default_type | string | 默认图片类型 |
| total_files | int | 上传文件数 |
| imported_count | int | 成功入库数 |
| duplicate_count | int | 重复编号数 |
| failed_count | int | 失败数 |
| operator_user_id | string | 上传用户 ID |
| operator_name | string | 上传人 |
| created_at | datetime | 创建时间 |

### operation_logs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 日志 ID |
| image_item_id | string | 主图 ID |
| action_type | string | 操作类型 |
| before_value | json | 操作前 |
| after_value | json | 操作后 |
| operator_user_id | string | 操作用户 ID |
| operator_name | string | 操作人 |
| remark | string | 备注 |
| created_at | datetime | 操作时间 |

## 3. 枚举

### 图片类型

- `hand_bag`：手提包
- `shoulder_bag`：单肩背包

### 主图状态

- `stored`：已入库
- `pending_check`：待核对
- `pending_design`：待出图
- `designing`：出图中
- `pending_acceptance`：待验收
- `pending_production`：待生产
- `producing`：生产中
- `completed`：已完成
- `need_revision`：需修改
- `revised`：已修改
- `deleted`：已删除

### 操作类型

- `excel_import`
- `manual_upload`
- `status_change`
- `quantity_change`
- `attachment_upload`
- `attachment_delete`
- `image_download`
- `soft_delete`

## 4. API 草案

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 图片归档入口

- `POST /api/import/excel/parse`
- `POST /api/import/excel/confirm`
- `POST /api/manual-upload/prepare`
- `POST /api/manual-upload/confirm`

### 图片中心

- `GET /api/image-items`
- `GET /api/image-items/:id`
- `PATCH /api/image-items/:id`
- `PATCH /api/image-items/:id/status`
- `PATCH /api/image-items/:id/quantity`
- `POST /api/image-items/batch-status`
- `POST /api/image-items/:id/download`
- `DELETE /api/image-items/:id`

### 套图

- `POST /api/image-items/:id/attachments`
- `DELETE /api/image-items/:id/attachments/:attachmentId`
- `POST /api/image-items/:id/attachments/:attachmentId/download`

### 日志

- `GET /api/image-items/:id/logs`
- `GET /api/operation-logs`

## 5. Excel 导入流程

1. 前端上传 Excel、归档日期、默认图片类型。
2. 后端读取 workbook，提取内嵌图片和行号关系。
3. 后端根据表头和内容猜测字段：图片、编号、名称、备注/排除判断。
4. 后端扫描排除关键词：删除、返单、不做、不要、作废。
5. 后端检查编号重复。
6. 返回导入预览，包括可入库、跳过、重复、异常。
7. 用户确认入库。
8. 后端保存图片文件，生成缩略图。
9. 后端写入 image_items、import_batches、operation_logs。

## 6. 手动上传流程

1. 前端选择归档日期、默认图片类型。
2. 前端上传一张或多张 jpg/png 图片。
3. 用户逐张填写编号、名称、图片类型、数量。
4. 后端校验编号唯一性。
5. 用户确认保存。
6. 后端保存图片文件，生成缩略图。
7. 后端写入 image_items、manual_upload_batches、operation_logs。

## 7. 校验规则

- 未登录请求返回 401。
- 停用用户不能登录。
- 编号不能为空。
- 编号必须唯一。
- 主图图片不能为空。
- 图片格式仅支持 jpg/png。
- 图片类型必须为手提包或单肩背包。
- 归档日期不能为空。
- 套图数量最多 10 张。
- 删除主图使用软删除。

## 8. 实施顺序建议

1. 搭建登录和会话。
2. 建立数据表和文件存储。
3. 实现图片中心列表和主图详情。
4. 实现手动上传。
5. 实现 Excel 解析和导入预览。
6. 实现状态看板。
7. 补充下载、日志、批量操作。
