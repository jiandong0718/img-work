# 图片归档工作台 Web App

这是基于现有产品设计初始化的 Vite + React + TypeScript MVP 工程。

## 已实现闭环

- 登录页。
- 登录后进入图片归档。
- 图片归档提供两个入口：Excel 导入、手动上传。
- 图片中心展示主图列表。
- 手动上传支持通过本地 API 新增主图并写入 `data/db.json`。
- Excel 导入支持选择文件、预览识别结果、过滤删除/返单/重复编号，并确认写入 `data/db.json`。
- Excel 导入支持 `.xlsx` 内嵌图片基础解析，并按图片所在行匹配编号、名称和数量。
- 图片中心支持编号/名称搜索、图片类型筛选、状态筛选、归档日期筛选和分页。
- 图片中心支持主图软删除、查看已删除数据和恢复主图。
- 图片中心可进入主图详情。
- 主图详情可通过本地 API 修改状态、图片类型、数量，并追加操作日志。
- 主图详情支持真实上传套图、按顺序展示、删除套图、下载主图和单张套图。
- 当前登录用户会自动写入新增记录和操作日志。

## 当前模拟内容

- 登录使用本地 API，默认账号为 `zhangsan` / `123456`。
- 手动上传支持真实 jpg/png 上传，文件存放在 `uploads/`。
- 套图上传复用本地图片上传能力，附件信息写入 `data/db.json`。
- Excel 导入当前支持 `.xlsx` 内嵌图片基础解析和 CSV/TSV 文本表格真实识别；旧版 `.xls` 暂不支持，需另存为 `.xlsx`。
- 默认数据存放在 `data/db.json` 中，可跨刷新保留；也可以通过 `DATA_DRIVER=mysql` 切换到 MySQL。

## 运行

先启动本地 API：

```bash
cd image-archive-product/app
npm run api
```

再启动前端：

```bash
cd image-archive-product/app
npm run dev
```

当前 API 端口为 `5190`，前端开发服务器端口配置为 `5188`。如果端口被占用，Vite 会自动顺延到下一个可用端口。

## MySQL 数据库

默认仍使用 JSON 文件，方便本地开发。要切换到 MySQL：

1. 创建数据库：

```sql
CREATE DATABASE image_archive_workbench DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 复制环境变量示例：

```bash
cd image-archive-product/app
cp .env.example .env
```

3. 修改 `.env`：

```bash
DATA_DRIVER=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=你的密码
MYSQL_DATABASE=image_archive_workbench
```

4. 将当前 `data/db.json` 迁移到 MySQL：

```bash
npm run db:migrate:mysql
```

5. 启动 API：

```bash
npm run api
```

MySQL 模式会自动创建 `users`、`sessions`、`image_items`、`import_batches`、`attachments`、`operation_logs` 表。上传图片文件仍存放在 `uploads/`，数据库只保存图片 URL。

## 构建验证

```bash
cd image-archive-product/app
npm run build
```

## 后续接入建议

1. 接入真实登录接口。
2. 将 React state 替换为 API 数据。
3. 接入真实图片上传。
4. 接入 Excel 内嵌图片解析。
5. 继续优化数据库读写粒度、文件存储和操作日志。
