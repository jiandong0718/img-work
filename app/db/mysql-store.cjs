let mysql
let pool

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(80) PRIMARY KEY,
    account VARCHAR(120) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    role VARCHAR(40) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'active',
    created_at VARCHAR(40) NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(120) PRIMARY KEY,
    user_id VARCHAR(80) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    expires_at VARCHAR(40) NOT NULL,
    INDEX idx_sessions_user_id (user_id),
    INDEX idx_sessions_expires_at (expires_at)
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id VARCHAR(120) PRIMARY KEY,
    code VARCHAR(80) NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    archive_date VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NULL,
    total_count INT NOT NULL DEFAULT 0,
    imported_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    operator_name VARCHAR(120) NOT NULL,
    created_at VARCHAR(40) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS image_items (
    id VARCHAR(120) PRIMARY KEY,
    code VARCHAR(120) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(40) NOT NULL,
    archive_date VARCHAR(20) NOT NULL,
    status VARCHAR(40) NOT NULL,
    required_quantity INT NOT NULL DEFAULT 1,
    produced_quantity INT NOT NULL DEFAULT 0,
    suite_count INT NOT NULL DEFAULT 0,
    image_url TEXT NOT NULL,
    operator_name VARCHAR(120) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    batch_id VARCHAR(120) NULL,
    batch_code VARCHAR(80) NULL,
    batch_name VARCHAR(160) NULL,
    deleted_at VARCHAR(40) NULL,
    INDEX idx_image_items_code (code),
    INDEX idx_image_items_status (status),
    INDEX idx_image_items_archive_date (archive_date),
    INDEX idx_image_items_batch_id (batch_id)
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id VARCHAR(120) PRIMARY KEY,
    image_item_id VARCHAR(120) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 1,
    operator_name VARCHAR(120) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    INDEX idx_attachments_image_item_id (image_item_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operation_logs (
    id VARCHAR(120) PRIMARY KEY,
    image_item_id VARCHAR(120) NULL,
    action VARCHAR(255) NOT NULL,
    operator_name VARCHAR(120) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    scope VARCHAR(40) NOT NULL DEFAULT 'image',
    INDEX idx_operation_logs_image_item_id (image_item_id),
    INDEX idx_operation_logs_created_at (created_at)
  )`,
]

function env(name, fallback = '') {
  return process.env[name] || fallback
}

function getPool() {
  if (pool) return pool
  try {
    mysql = require('mysql2/promise')
  } catch (error) {
    throw new Error('缺少 mysql2 依赖，请先在 app 目录执行 npm install')
  }
  pool = mysql.createPool({
    host: env('MYSQL_HOST', '127.0.0.1'),
    port: Number(env('MYSQL_PORT', '3306')),
    user: env('MYSQL_USER', 'root'),
    password: env('MYSQL_PASSWORD', ''),
    database: env('MYSQL_DATABASE', 'image_archive_workbench'),
    waitForConnections: true,
    connectionLimit: Number(env('MYSQL_CONNECTION_LIMIT', '10')),
    namedPlaceholders: false,
    dateStrings: true,
  })
  return pool
}

function createMysqlStore({ defaultDb, normalizeDb }) {
  async function ensureSchema() {
    const activePool = getPool()
    for (const statement of schemaStatements) {
      await activePool.execute(statement)
    }
  }

  async function queryAll() {
    const activePool = getPool()
    const [[users], [sessions], [importBatches], [imageItems], [attachments], [operationLogs]] = await Promise.all([
      activePool.query('SELECT * FROM users ORDER BY created_at ASC, id ASC'),
      activePool.query('SELECT * FROM sessions ORDER BY created_at ASC, id ASC'),
      activePool.query('SELECT * FROM import_batches ORDER BY created_at DESC, id DESC'),
      activePool.query('SELECT * FROM image_items ORDER BY id DESC'),
      activePool.query('SELECT * FROM attachments ORDER BY image_item_id ASC, sort_order ASC'),
      activePool.query('SELECT * FROM operation_logs ORDER BY created_at DESC, id DESC'),
    ])
    return { users, sessions, importBatches, imageItems, attachments, operationLogs }
  }

  async function readDb() {
    await ensureSchema()
    let rows = await queryAll()
    if (rows.users.length === 0 && rows.imageItems.length === 0) {
      await writeDb(defaultDb)
      rows = await queryAll()
    }
    return normalizeDb({
      users: rows.users.map((row) => ({
        id: row.id,
        account: row.account,
        password: row.password,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        createdAt: row.created_at || undefined,
      })),
      sessions: rows.sessions.map((row) => ({
        id: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      })),
      importBatches: rows.importBatches.map((row) => ({
        id: row.id,
        code: row.code || undefined,
        name: row.name,
        sourceType: row.source_type,
        archiveDate: row.archive_date,
        fileName: row.file_name || undefined,
        totalCount: Number(row.total_count || 0),
        importedCount: Number(row.imported_count || 0),
        skippedCount: Number(row.skipped_count || 0),
        operatorName: row.operator_name,
        createdAt: row.created_at,
      })),
      imageItems: rows.imageItems.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.type,
        archiveDate: row.archive_date,
        status: row.status,
        requiredQuantity: Number(row.required_quantity || 1),
        producedQuantity: Number(row.produced_quantity || 0),
        suiteCount: Number(row.suite_count || 0),
        imageUrl: row.image_url,
        operatorName: row.operator_name,
        updatedAt: row.updated_at,
        sourceType: row.source_type,
        batchId: row.batch_id || undefined,
        batchCode: row.batch_code || undefined,
        batchName: row.batch_name || undefined,
        deletedAt: row.deleted_at || undefined,
      })),
      attachments: rows.attachments.map((row) => ({
        id: row.id,
        imageItemId: row.image_item_id,
        fileName: row.file_name,
        fileUrl: row.file_url,
        sortOrder: Number(row.sort_order || 1),
        operatorName: row.operator_name,
        createdAt: row.created_at,
      })),
      operationLogs: rows.operationLogs.map((row) => ({
        id: row.id,
        imageItemId: row.image_item_id || null,
        action: row.action,
        operatorName: row.operator_name,
        createdAt: row.created_at,
        scope: row.scope || 'image',
      })),
    })
  }

  async function writeDb(db) {
    await ensureSchema()
    const normalized = normalizeDb(db)
    const activePool = getPool()
    const connection = await activePool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query('DELETE FROM operation_logs')
      await connection.query('DELETE FROM attachments')
      await connection.query('DELETE FROM image_items')
      await connection.query('DELETE FROM import_batches')
      await connection.query('DELETE FROM sessions')
      await connection.query('DELETE FROM users')

      for (const user of normalized.users) {
        await connection.execute(
          'INSERT INTO users (id, account, password, display_name, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [user.id, user.account, user.password, user.displayName, user.role, user.status || 'active', user.createdAt || null],
        )
      }
      for (const session of normalized.sessions) {
        await connection.execute(
          'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
          [session.id, session.userId, session.createdAt, session.expiresAt],
        )
      }
      for (const batch of normalized.importBatches) {
        await connection.execute(
          'INSERT INTO import_batches (id, code, name, source_type, archive_date, file_name, total_count, imported_count, skipped_count, operator_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            batch.id,
            batch.code || null,
            batch.name,
            batch.sourceType,
            batch.archiveDate,
            batch.fileName || null,
            batch.totalCount || 0,
            batch.importedCount || 0,
            batch.skippedCount || 0,
            batch.operatorName,
            batch.createdAt,
          ],
        )
      }
      for (const item of normalized.imageItems) {
        await connection.execute(
          'INSERT INTO image_items (id, code, name, type, archive_date, status, required_quantity, produced_quantity, suite_count, image_url, operator_name, updated_at, source_type, batch_id, batch_code, batch_name, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            item.id,
            item.code,
            item.name,
            item.type,
            item.archiveDate,
            item.status,
            item.requiredQuantity || 1,
            item.producedQuantity || 0,
            item.suiteCount || 0,
            item.imageUrl,
            item.operatorName,
            item.updatedAt,
            item.sourceType,
            item.batchId || null,
            item.batchCode || null,
            item.batchName || null,
            item.deletedAt || null,
          ],
        )
      }
      for (const attachment of normalized.attachments) {
        await connection.execute(
          'INSERT INTO attachments (id, image_item_id, file_name, file_url, sort_order, operator_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [attachment.id, attachment.imageItemId, attachment.fileName, attachment.fileUrl, attachment.sortOrder || 1, attachment.operatorName, attachment.createdAt],
        )
      }
      for (const log of normalized.operationLogs) {
        await connection.execute(
          'INSERT INTO operation_logs (id, image_item_id, action, operator_name, created_at, scope) VALUES (?, ?, ?, ?, ?, ?)',
          [log.id, log.imageItemId || null, log.action, log.operatorName, log.createdAt, log.scope || 'image'],
        )
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  return {
    ensureDb: ensureSchema,
    readDb,
    writeDb,
  }
}

module.exports = { createMysqlStore, schemaStatements }
