const fs = require('fs')
const path = require('path')
const { createMysqlStore } = require('../db/mysql-store.cjs')

const ROOT = path.join(__dirname, '..')
const DB_FILE = path.join(ROOT, 'data', 'db.json')

function loadEnvFile(filePath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, 'utf-8')
  content.split(/\r?\n/u).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const separator = trimmed.indexOf('=')
    if (separator < 0) return
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/gu, '')
    if (key && process.env[key] === undefined) process.env[key] = value
  })
}

function normalizeDb(db) {
  const normalized = {
    users: Array.isArray(db.users) ? db.users : [],
    sessions: Array.isArray(db.sessions) ? db.sessions : [],
    imageItems: Array.isArray(db.imageItems) ? db.imageItems : [],
    operationLogs: Array.isArray(db.operationLogs) ? db.operationLogs : [],
    importBatches: Array.isArray(db.importBatches) ? db.importBatches : [],
    attachments: Array.isArray(db.attachments) ? db.attachments : [],
  }
  normalized.imageItems = normalized.imageItems.map((item) => {
    const batch = normalized.importBatches.find((candidate) => candidate.id === item.batchId)
    return {
      ...item,
      batchCode: item.batchCode || batch?.code,
      batchName: item.batchName || batch?.name,
    }
  })
  return normalized
}

async function main() {
  loadEnvFile()
  if (!fs.existsSync(DB_FILE)) {
    throw new Error(`没有找到 JSON 数据文件：${DB_FILE}`)
  }
  const db = normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')))
  const store = createMysqlStore({ defaultDb: db, normalizeDb })
  await store.writeDb(db)
  console.log(`已迁移到 MySQL：${db.users.length} 个用户，${db.imageItems.length} 条主图，${db.attachments.length} 条套图。`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
