const http = require('http')
const crypto = require('crypto')
const { execFile } = require('child_process')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const ROOT = __dirname
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const UPLOAD_DIR = path.join(ROOT, 'uploads')
const HOST = process.env.API_HOST || '127.0.0.1'
const PORT = Number(process.env.API_PORT || 5190)
const SESSION_COOKIE = 'img_work_session'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const imageStatuses = new Set([
  'pending_review',
  'stored',
  'pending_design',
  'designing',
  'pending_acceptance',
  'need_revision',
  'revised',
  'pending_production',
  'production',
  'completed',
  'deleted',
])
const imageStatusLabels = {
  pending_review: '待核对',
  stored: '已入库',
  pending_design: '待出图',
  designing: '出图中',
  pending_acceptance: '待验收',
  need_revision: '需修改',
  revised: '已修改',
  pending_production: '待生产',
  production: '生产中',
  completed: '已完成',
  deleted: '已删除',
}

const sampleImages = [
  '/sample/example_pc_1.png',
  '/sample/example_pc_2.png',
  '/sample/example_mb_1.jpg',
  '/sample/example_mb_2.jpg',
]

const defaultDb = {
  users: [
    {
      id: 'u-1',
      account: 'zhangsan',
      password: '123456',
      displayName: '张三',
      role: 'admin',
      status: 'active',
    },
  ],
  sessions: [],
  imageItems: [
    {
      id: 'img-1',
      code: 'A-2048',
      name: '夏季套装主图',
      type: 'hand_bag',
      archiveDate: '2026-06-06',
      status: 'pending_design',
      requiredQuantity: 120,
      producedQuantity: 0,
      suiteCount: 2,
      imageUrl: sampleImages[0],
      operatorName: '张三',
      updatedAt: '14:22',
      sourceType: 'excel',
    },
    {
      id: 'img-2',
      code: 'A-2081',
      name: '基础款图片',
      type: 'shoulder_bag',
      archiveDate: '2026-06-06',
      status: 'pending_acceptance',
      requiredQuantity: 80,
      producedQuantity: 0,
      suiteCount: 8,
      imageUrl: sampleImages[1],
      operatorName: '李四',
      updatedAt: '13:40',
      sourceType: 'excel',
    },
    {
      id: 'img-3',
      code: 'A-2096',
      name: '生产确认图',
      type: 'hand_bag',
      archiveDate: '2026-06-06',
      status: 'pending_production',
      requiredQuantity: 200,
      producedQuantity: 40,
      suiteCount: 10,
      imageUrl: sampleImages[3],
      operatorName: '王五',
      updatedAt: '11:18',
      sourceType: 'manual',
    },
  ],
  operationLogs: [
    { id: 'log-1', imageItemId: 'img-1', action: 'Excel 导入入库', operatorName: '张三', createdAt: '2026-06-06 14:10' },
    { id: 'log-2', imageItemId: 'img-1', action: '状态改为待出图', operatorName: '张三', createdAt: '2026-06-06 14:22' },
  ],
  importBatches: [],
  attachments: [],
}

async function ensureDb() {
  await fsp.mkdir(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DB_FILE)) {
    await writeDb(defaultDb)
  }
}

async function readDb() {
  await ensureDb()
  const content = await fsp.readFile(DB_FILE, 'utf-8')
  try {
    const db = JSON.parse(content)
    db.attachments = Array.isArray(db.attachments) ? db.attachments : []
    db.importBatches = Array.isArray(db.importBatches) ? db.importBatches : []
    db.sessions = Array.isArray(db.sessions) ? db.sessions : []
    db.imageItems = (Array.isArray(db.imageItems) ? db.imageItems : []).map((item) => ({
      ...item,
      batchName: item.batchName || db.importBatches.find((batch) => batch.id === item.batchId)?.name,
    }))
    return db
  } catch (error) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupFile = path.join(DATA_DIR, `db.corrupt-${stamp}.json`)
    await fsp.writeFile(backupFile, content)
    await writeDb(defaultDb)
    console.error(`DB JSON is invalid. Backed up corrupted file to ${backupFile}`)
    return JSON.parse(await fsp.readFile(DB_FILE, 'utf-8'))
  }
}

async function writeDb(db) {
  await fsp.mkdir(DATA_DIR, { recursive: true })
  const tempFile = `${DB_FILE}.tmp`
  await fsp.writeFile(tempFile, JSON.stringify(db, null, 2))
  await fsp.rename(tempFile, DB_FILE)
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const contentType = ext === '.png' ? 'image/png' : 'image/jpeg'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000',
  })
  fs.createReadStream(filePath).pipe(res)
}

function sendZipFile(res, filePath, fileName) {
  res.writeHead(200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'no-store',
  })
  fs.createReadStream(filePath).pipe(res)
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

function parseCookies(req) {
  return String(req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf('=')
      if (separator === -1) return cookies
      cookies[decodeURIComponent(item.slice(0, separator))] = decodeURIComponent(item.slice(separator + 1))
      return cookies
    }, {})
}

function sessionCookie(value, maxAge = SESSION_MAX_AGE_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

function clearSessionCookie() {
  return sessionCookie('', 0)
}

function findSessionUser(req, db) {
  const sessionId = parseCookies(req)[SESSION_COOKIE]
  if (!sessionId) return null
  const now = Date.now()
  const session = db.sessions.find((candidate) => candidate.id === sessionId && Date.parse(candidate.expiresAt) > now)
  if (!session) return null
  const user = db.users.find((candidate) => candidate.id === session.userId && candidate.status === 'active')
  return user || null
}

function createSession(db, user) {
  const id = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now() && session.userId !== user.id)
  db.sessions.push({ id, userId: user.id, createdAt: new Date().toISOString(), expiresAt })
  return id
}

function removeSession(req, db) {
  const sessionId = parseCookies(req)[SESSION_COOKIE]
  if (!sessionId) return
  db.sessions = db.sessions.filter((session) => session.id !== sessionId)
}

function safeFileName(value, fallback = 'file') {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return normalized || fallback
}

function filePathFromUrl(fileUrl) {
  if (!fileUrl) return null
  const pathname = new URL(fileUrl, 'http://local').pathname
  if (pathname.startsWith('/uploads/')) {
    return path.join(UPLOAD_DIR, path.basename(pathname))
  }
  if (pathname.startsWith('/sample/')) {
    return path.join(ROOT, 'public', 'sample', path.basename(pathname))
  }
  return null
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf-8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 160 * 1024 * 1024) {
        req.destroy()
        reject(new Error('上传内容过大，请压缩图片或分批上传'))
      }
    })
    req.on('end', () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function publicUser(user) {
  return {
    id: user.id,
    account: user.account,
    displayName: user.displayName,
    role: user.role,
  }
}

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function addLog(db, imageItemId, action, operatorName) {
  db.operationLogs.unshift({
    id: `log-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    imageItemId,
    action,
    operatorName,
    createdAt: `2026-06-06 ${nowTime()}`,
  })
}

function createImportBatch({ sourceType, archiveDate, fileName, totalCount, importedCount, skippedCount, operatorName }) {
  const sourceLabel = sourceType === 'excel' ? 'Excel 导入' : '手动上传'
  return {
    id: `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${archiveDate} ${sourceLabel}`,
    sourceType,
    archiveDate,
    fileName,
    totalCount,
    importedCount,
    skippedCount,
    operatorName,
    createdAt: `2026-06-06 ${nowTime()}`,
  }
}

function createItemFromDraft(draft, archiveDate, operatorName, index, batch) {
  return {
    id: `manual-${Date.now()}-${index}`,
    code: String(draft.code || '').trim(),
    name: String(draft.name || '').trim() || '未命名主图',
    type: draft.type === 'shoulder_bag' ? 'shoulder_bag' : 'hand_bag',
    archiveDate,
    status: 'stored',
    requiredQuantity: Math.max(1, Number(draft.requiredQuantity || 1)),
    producedQuantity: 0,
    suiteCount: 0,
    imageUrl: draft.imageUrl || sampleImages[index % sampleImages.length],
    operatorName,
    updatedAt: nowTime(),
    sourceType: 'manual',
    batchId: batch?.id,
    batchName: batch?.name,
  }
}

function createItemFromExcelRow(row, archiveDate, type, operatorName, index, batch) {
  return {
    id: `excel-${Date.now()}-${index}`,
    code: String(row.code || '').trim(),
    name: String(row.name || '').trim() || 'Excel 导入主图',
    type: type === 'shoulder_bag' ? 'shoulder_bag' : 'hand_bag',
    archiveDate,
    status: 'stored',
    requiredQuantity: Math.max(1, Number(row.requiredQuantity || 1)),
    producedQuantity: 0,
    suiteCount: 0,
    imageUrl: row.imageUrl || sampleImages[index % sampleImages.length],
    operatorName,
    updatedAt: nowTime(),
    sourceType: 'excel',
    batchId: batch?.id,
    batchName: batch?.name,
  }
}

function splitDelimitedLine(line, delimiter) {
  const cells = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function parseDelimitedTable(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/u, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return { headers: [], records: [] }

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = splitDelimitedLine(lines[0], delimiter)
  const records = lines.slice(1).map((line, index) => ({
    rowNumber: index + 2,
    cells: splitDelimitedLine(line, delimiter),
  }))
  return { headers, records }
}

function findColumn(headers, keywords) {
  return headers.findIndex((header) => {
    const normalized = String(header || '').toLowerCase()
    return keywords.some((keyword) => normalized.includes(keyword))
  })
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function columnIndexFromRef(ref) {
  const letters = String(ref || '').replace(/[^A-Z]/giu, '').toUpperCase()
  let index = 0
  for (const letter of letters) {
    index = index * 26 + letter.charCodeAt(0) - 64
  }
  return index - 1
}

function rowNumberFromRef(ref) {
  return Number(String(ref || '').replace(/\D/gu, '')) || 0
}

function getXmlTag(content, tagName) {
  const match = new RegExp(`<[^>]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^>]*:?${tagName}>`, 'u').exec(content)
  return match ? match[1] : ''
}

function getXmlAttr(content, attrName) {
  const match = new RegExp(`${attrName}="([^"]+)"`, 'u').exec(content)
  return match ? decodeXml(match[1]) : ''
}

function parseSharedStrings(xml) {
  const strings = []
  for (const siMatch of xml.matchAll(/<si[\s\S]*?<\/si>/gu)) {
    const text = [...siMatch[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/gu)].map((match) => decodeXml(match[1])).join('')
    strings.push(text)
  }
  return strings
}

function parseSheetRows(xml, sharedStrings) {
  const rows = new Map()
  for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/gu)) {
    const rowNumber = Number(rowMatch[1])
    const cells = []
    const formulas = []
    for (const cellMatch of rowMatch[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/gu)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2]
      const ref = getXmlAttr(attrs, 'r')
      const type = getXmlAttr(attrs, 't')
      const colIndex = columnIndexFromRef(ref)
      const formula = getXmlTag(body, 'f')
      const valueRaw = getXmlTag(body, 'v')
      const inlineText = getXmlTag(body, 't')
      let value = decodeXml(valueRaw)
      if (type === 's') {
        value = sharedStrings[Number(valueRaw)] || ''
      } else if (type === 'inlineStr') {
        value = decodeXml(inlineText)
      }
      cells[colIndex] = value
      formulas[colIndex] = decodeXml(formula)
    }
    cells.__formulas = formulas
    rows.set(rowNumber, cells)
  }
  return rows
}

async function unzipList(filePath) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', filePath], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return stdout.split(/\r?\n/u).filter(Boolean)
}

async function unzipRead(filePath, entry, encoding = 'utf8') {
  const { stdout } = await execFileAsync('unzip', ['-p', filePath, entry], { encoding, maxBuffer: 50 * 1024 * 1024 })
  return stdout
}

function normalizeZipTarget(baseDir, target) {
  return path.posix.normalize(path.posix.join(baseDir, target)).replace(/^\/+/u, '')
}

function parseRelationships(xml, baseDir) {
  const rels = new Map()
  for (const relMatch of xml.matchAll(/<Relationship([^>]*)\/>/gu)) {
    const attrs = relMatch[1]
    const id = getXmlAttr(attrs, 'Id')
    const target = getXmlAttr(attrs, 'Target')
    if (id && target) rels.set(id, normalizeZipTarget(baseDir, target))
  }
  return rels
}

function parseDrawingImages(xml, imageRels) {
  const images = []
  const anchors = xml.match(/<[^>]*:?(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/[^>]*:?(?:twoCellAnchor|oneCellAnchor)>/gu) || []
  anchors.forEach((anchor) => {
    const from = anchor.match(/<[^>]*:?from>([\s\S]*?)<\/[^>]*:?from>/u)?.[1] || ''
    const row = Number(getXmlTag(from, 'row')) + 1
    const col = Number(getXmlTag(from, 'col'))
    const embed = anchor.match(/(?:r:embed|embed)="([^"]+)"/u)?.[1] || ''
    const mediaEntry = imageRels.get(embed)
    if (row && mediaEntry) images.push({ rowNumber: row, colIndex: Number.isFinite(col) ? col : -1, mediaEntry })
  })
  return images
}

function parseCellImageMap(xml, imageRels) {
  const images = new Map()
  const blocks = xml.match(/<[^>]*:?cellImage[\s\S]*?<\/[^>]*:?cellImage>/gu) || []
  blocks.forEach((block) => {
    const id = block.match(/<[^>]*:?cNvPr[^>]*name="([^"]+)"/u)?.[1] || ''
    const embed = block.match(/(?:r:embed|embed)="([^"]+)"/u)?.[1] || ''
    const mediaEntry = imageRels.get(embed)
    if (id && mediaEntry && mediaEntry !== 'xl/NULL') images.set(decodeXml(id), mediaEntry)
  })
  return images
}

function parseDispImageAnchors(sheetRows, cellImages) {
  const anchors = []
  for (const [rowNumber, cells] of sheetRows.entries()) {
    const formulas = cells.__formulas || []
    formulas.forEach((formula, colIndex) => {
      const imageId = String(formula || '').match(/DISPIMG\("([^"]+)"/u)?.[1] || ''
      const mediaEntry = cellImages.get(imageId)
      if (mediaEntry) anchors.push({ rowNumber, colIndex, mediaEntry })
    })
  }
  return anchors
}

function findColumnNear(headers, keywords, anchorCol = -1) {
  const matches = []
  headers.forEach((header, index) => {
    const normalized = String(header || '').trim().toLowerCase()
    if (keywords.some((keyword) => normalized.includes(keyword))) matches.push(index)
  })
  if (matches.length === 0) return -1
  if (anchorCol < 0) return matches[0]
  return matches.sort((left, right) => Math.abs(left - anchorCol) - Math.abs(right - anchorCol))[0]
}

function inferColumnsForImage(sheetRows, rowNumber, imageColIndex) {
  const start = Math.max(1, rowNumber - 20)
  for (let headerRow = rowNumber - 1; headerRow >= start; headerRow -= 1) {
    const headers = sheetRows.get(headerRow) || []
    const imageHeaderIndex = findColumnNear(headers, ['图片', 'image', 'photo'], imageColIndex)
    if (imageHeaderIndex < 0) continue
    if (imageColIndex >= 0 && Math.abs(imageHeaderIndex - imageColIndex) > 2) continue
    const codeIndex = findColumnNear(headers, ['编号', '款号', '货号', 'code', 'sku'], imageHeaderIndex)
    if (codeIndex < 0) continue
    return {
      headerRow,
      codeIndex,
      nameIndex: findColumnNear(headers, ['名称', '品名', '中文品名', 'name', 'title'], imageHeaderIndex),
      quantityIndex: findColumnNear(headers, ['数量', '需求', '生产', 'qty', 'quantity'], imageHeaderIndex),
    }
  }
  return null
}

function isDisplayImageValue(value) {
  return /DISPIMG\("/u.test(String(value || ''))
}

function fallbackCodeFromRow(cells, columns, imageColIndex) {
  if (imageColIndex < 0) return ''
  for (let index = imageColIndex - 1; index >= 0; index -= 1) {
    if (index === columns.nameIndex || index === columns.quantityIndex) continue
    const value = String(cells[index] || '').trim()
    if (value && !isDisplayImageValue(value)) return value
  }
  return ''
}

async function saveXlsxMedia(zipFile, mediaEntry) {
  const ext = path.extname(mediaEntry).toLowerCase() === '.png' ? 'png' : 'jpg'
  const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${path.basename(mediaEntry, path.extname(mediaEntry))}.${ext}`
  const buffer = await unzipRead(zipFile, mediaEntry, 'buffer')
  await fsp.mkdir(UPLOAD_DIR, { recursive: true })
  await fsp.writeFile(path.join(UPLOAD_DIR, storedName), buffer)
  return `/uploads/${storedName}`
}

async function buildXlsxPreview({ fileName, content }, db) {
  const match = /^data:.*?;base64,(.+)$/u.exec(String(content || ''))
  if (!match) throw new Error('没有读取到 Excel 文件内容')

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'image-archive-xlsx-'))
  const xlsxFile = path.join(tempDir, fileName || `import-${Date.now()}.xlsx`)
  try {
    await fsp.writeFile(xlsxFile, Buffer.from(match[1], 'base64'))
    const entries = await unzipList(xlsxFile)
    const sheetEntry = entries.find((entry) => /^xl\/worksheets\/sheet1\.xml$/u.test(entry)) || entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry))
    if (!sheetEntry) throw new Error('没有识别到工作表')

    const sharedEntry = entries.find((entry) => entry === 'xl/sharedStrings.xml')
    const sharedStrings = sharedEntry ? parseSharedStrings(await unzipRead(xlsxFile, sharedEntry)) : []
    const sheetRows = parseSheetRows(await unzipRead(xlsxFile, sheetEntry), sharedStrings)
    const firstRow = sheetRows.get(1) || []
    const codeIndex = findColumn(firstRow, ['编号', '款号', '货号', 'code', 'sku'])
    const nameIndex = findColumn(firstRow, ['名称', '品名', 'name', 'title'])
    const quantityIndex = findColumn(firstRow, ['数量', '需求', '生产', 'qty', 'quantity'])

    const sheetName = path.posix.basename(sheetEntry)
    const sheetRelEntry = `xl/worksheets/_rels/${sheetName}.rels`
    const drawingEntries = []
    if (entries.includes(sheetRelEntry)) {
      const sheetRels = parseRelationships(await unzipRead(xlsxFile, sheetRelEntry), 'xl/worksheets')
      for (const target of sheetRels.values()) {
        if (/^xl\/drawings\/drawing\d+\.xml$/u.test(target)) drawingEntries.push(target)
      }
    }
    if (drawingEntries.length === 0) {
      drawingEntries.push(...entries.filter((entry) => /^xl\/drawings\/drawing\d+\.xml$/u.test(entry)))
    }

    const imageAnchors = []
    for (const drawingEntry of drawingEntries) {
      const relEntry = `xl/drawings/_rels/${path.posix.basename(drawingEntry)}.rels`
      if (!entries.includes(relEntry)) continue
      const imageRels = parseRelationships(await unzipRead(xlsxFile, relEntry), 'xl/drawings')
      imageAnchors.push(...parseDrawingImages(await unzipRead(xlsxFile, drawingEntry), imageRels))
    }

    if (entries.includes('xl/cellimages.xml') && entries.includes('xl/_rels/cellimages.xml.rels')) {
      const cellImageRels = parseRelationships(await unzipRead(xlsxFile, 'xl/_rels/cellimages.xml.rels'), 'xl')
      const cellImages = parseCellImageMap(await unzipRead(xlsxFile, 'xl/cellimages.xml'), cellImageRels)
      imageAnchors.push(...parseDispImageAnchors(sheetRows, cellImages))
    }

    const existingCodes = new Set(db.imageItems.map((item) => item.code))
    const seenCodes = new Set()
    const rows = []
    for (let index = 0; index < imageAnchors.length; index += 1) {
      const anchor = imageAnchors[index]
      const cells = sheetRows.get(anchor.rowNumber) || []
      const columns =
        inferColumnsForImage(sheetRows, anchor.rowNumber, anchor.colIndex) ||
        (codeIndex >= 0
          ? {
              codeIndex,
              nameIndex,
              quantityIndex,
            }
          : null)
      const joined = cells.join(' ')
      const codeFromColumn = columns ? String(cells[columns.codeIndex] || '').trim() : ''
      const code = codeFromColumn || (columns ? fallbackCodeFromRow(cells, columns, anchor.colIndex) : '')
      const rawName = columns && columns.nameIndex >= 0 ? String(cells[columns.nameIndex] || '').trim() : ''
      const name = isDisplayImageValue(rawName) ? '' : rawName
      const quantity = columns && columns.quantityIndex >= 0 ? Math.max(1, Number(cells[columns.quantityIndex] || 1)) : 1
      let skipReason = ''
      if (!columns) skipReason = '未识别到字段表头'
      if (!skipReason && !code) skipReason = '编号为空'
      if (!skipReason && /删除|返单|不做|不要|作废/u.test(joined)) skipReason = '包含排除字样'
      if (!skipReason && existingCodes.has(code)) skipReason = '重复编号'
      if (!skipReason && seenCodes.has(code)) skipReason = '文件内重复编号'
      if (!skipReason) seenCodes.add(code)
      rows.push({
        rowNumber: anchor.rowNumber,
        code,
        name: name || `Excel 第 ${anchor.rowNumber} 行`,
        requiredQuantity: Number.isFinite(quantity) ? quantity : 1,
        imageUrl: await saveXlsxMedia(xlsxFile, anchor.mediaEntry),
        skipReason,
      })
    }

    const importableCount = rows.filter((row) => !row.skipReason).length
    return {
      fileName,
      totalRows: rows.length,
      importableCount,
      skippedCount: rows.length - importableCount,
      message: rows.length > 0 ? '已解析 xlsx 内嵌图片，并按图片所在行匹配编号、名称和数量。' : '已读取 xlsx，但没有识别到单元格内嵌图片。',
      rows,
    }
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true })
  }
}

async function buildExcelPreview({ fileName, content, type }, db) {
  const lowerName = String(fileName || '').toLowerCase()
  if (lowerName.endsWith('.xlsx')) {
    return buildXlsxPreview({ fileName, content, type }, db)
  }
  if (lowerName.endsWith('.xls')) {
    throw new Error('暂不支持旧版 .xls，请另存为 .xlsx 后导入')
  }

  const { headers, records } = parseDelimitedTable(content)
  const codeIndex = findColumn(headers, ['编号', '款号', '货号', 'code', 'sku'])
  const nameIndex = findColumn(headers, ['名称', '品名', 'name', 'title'])
  const quantityIndex = findColumn(headers, ['数量', '需求', '生产', 'qty', 'quantity'])
  const existingCodes = new Set(db.imageItems.map((item) => item.code))
  const seenCodes = new Set()

  if (codeIndex < 0) {
    return {
      fileName,
      totalRows: records.length,
      importableCount: 0,
      skippedCount: records.length,
      message: '没有识别到编号列，请确认表头包含“编号 / 款号 / 货号 / code / sku”。',
      rows: records.map((record) => ({
        rowNumber: record.rowNumber,
        code: '',
        name: '',
        requiredQuantity: 1,
        imageUrl: sampleImages[0],
        skipReason: '缺少编号列',
      })),
    }
  }

  const rows = records.map((record, index) => {
    const joined = record.cells.join(' ')
    const code = String(record.cells[codeIndex] || '').trim()
    const name = nameIndex >= 0 ? String(record.cells[nameIndex] || '').trim() : ''
    const requiredQuantity = quantityIndex >= 0 ? Math.max(1, Number(record.cells[quantityIndex] || 1)) : 1
    let skipReason = ''
    if (!code) skipReason = '编号为空'
    if (!skipReason && /删除|返单/u.test(joined)) skipReason = '包含删除/返单字样'
    if (!skipReason && existingCodes.has(code)) skipReason = '重复编号'
    if (!skipReason && seenCodes.has(code)) skipReason = '文件内重复编号'
    if (!skipReason) seenCodes.add(code)

    return {
      rowNumber: record.rowNumber,
      code,
      name: name || `Excel 第 ${record.rowNumber} 行`,
      requiredQuantity: Number.isFinite(requiredQuantity) ? requiredQuantity : 1,
      imageUrl: sampleImages[index % sampleImages.length],
      skipReason,
    }
  })

  const importableCount = rows.filter((row) => !row.skipReason).length
  return {
    fileName,
    totalRows: rows.length,
    importableCount,
    skippedCount: rows.length - importableCount,
    message: '已识别 CSV 表格。图片暂用占位主图，后续接入 xlsx 内嵌图片解析后会替换为真实图片。',
    rows,
  }
}

async function saveDataUrlImage(dataUrl, fileName = 'upload') {
  const match = /^data:(image\/png|image\/jpeg|image\/jpg);base64,(.+)$/u.exec(String(dataUrl || ''))
  if (!match) {
    throw new Error('仅支持 jpg/png 图片')
  }
  const ext = match[1] === 'image/png' ? 'png' : 'jpg'
  const safeBase = path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 60)
  const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeBase || 'upload'}.${ext}`
  await fsp.mkdir(UPLOAD_DIR, { recursive: true })
  await fsp.writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(match[2], 'base64'))
  return `/uploads/${storedName}`
}

async function route(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const db = await readDb()

  if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
    const fileName = path.basename(url.pathname)
    const filePath = path.join(UPLOAD_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: '文件不存在' })
      return
    }
    sendFile(res, filePath)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readJson(req)
    const user = db.users.find((candidate) => candidate.account === body.account && candidate.password === body.password)
    if (!user || user.status !== 'active') {
      sendJson(res, 401, { error: '账号或密码不正确' })
      return
    }
    const sessionId = createSession(db, user)
    await writeDb(db)
    sendJson(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(sessionId) })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = findSessionUser(req, db)
    if (!user) {
      sendJson(res, 401, { error: '未登录或登录已过期' })
      return
    }
    sendJson(res, 200, { user: publicUser(user) })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    removeSession(req, db)
    await writeDb(db)
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() })
    return
  }

  if (url.pathname.startsWith('/api/')) {
    const user = findSessionUser(req, db)
    if (!user) {
      sendJson(res, 401, { error: '未登录或登录已过期，请重新登录' })
      return
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/image-items') {
    sendJson(res, 200, { items: db.imageItems, batches: db.importBatches })
    return
  }

  const attachmentsMatch = url.pathname.match(/^\/api\/image-items\/([^/]+)\/attachments$/)
  if (req.method === 'GET' && attachmentsMatch) {
    const attachments = db.attachments
      .filter((attachment) => attachment.imageItemId === attachmentsMatch[1])
      .sort((left, right) => left.sortOrder - right.sortOrder)
    sendJson(res, 200, { attachments })
    return
  }

  const packageDownloadMatch = url.pathname.match(/^\/api\/image-items\/([^/]+)\/download-package$/)
  if (req.method === 'GET' && packageDownloadMatch) {
    const item = db.imageItems.find((candidate) => candidate.id === packageDownloadMatch[1])
    if (!item) {
      sendJson(res, 404, { error: '主图不存在' })
      return
    }

    const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'image-package-'))
    const sourceDir = path.join(tempRoot, safeFileName(item.code, 'image-item'))
    const suiteDir = path.join(sourceDir, 'suite')
    const zipFile = path.join(tempRoot, `${safeFileName(item.code, 'image-item')}.zip`)

    try {
      await fsp.mkdir(suiteDir, { recursive: true })
      let fileCount = 0
      const mainPath = filePathFromUrl(item.imageUrl)
      if (mainPath && fs.existsSync(mainPath)) {
        const ext = path.extname(mainPath) || '.jpg'
        await fsp.copyFile(mainPath, path.join(sourceDir, `main-${safeFileName(item.code)}${ext}`))
        fileCount += 1
      }

      const attachments = db.attachments
        .filter((attachment) => attachment.imageItemId === item.id)
        .sort((left, right) => left.sortOrder - right.sortOrder)
      for (const attachment of attachments) {
        const attachmentPath = filePathFromUrl(attachment.fileUrl)
        if (!attachmentPath || !fs.existsSync(attachmentPath)) continue
        const ext = path.extname(attachmentPath) || path.extname(attachment.fileName) || '.jpg'
        const name = `suite-${String(attachment.sortOrder).padStart(2, '0')}-${safeFileName(attachment.fileName, 'suite')}${ext}`
        await fsp.copyFile(attachmentPath, path.join(suiteDir, name))
        fileCount += 1
      }

      if (fileCount === 0) {
        await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
        sendJson(res, 404, { error: '没有可打包的图片文件' })
        return
      }

      await execFileAsync('zip', ['-qr', zipFile, path.basename(sourceDir)], { cwd: tempRoot })
      res.on('finish', () => {
        fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
      })
      sendZipFile(res, zipFile, `${safeFileName(item.code, 'image-package')}.zip`)
    } catch (error) {
      await fsp.rm(tempRoot, { recursive: true, force: true }).catch(() => {})
      throw error
    }
    return
  }

  if (req.method === 'POST' && attachmentsMatch) {
    const body = await readJson(req)
    const item = db.imageItems.find((candidate) => candidate.id === attachmentsMatch[1])
    if (!item) {
      sendJson(res, 404, { error: '主图不存在' })
      return
    }
    const current = db.attachments.filter((attachment) => attachment.imageItemId === item.id)
    const files = Array.isArray(body.files) ? body.files : []
    if (current.length + files.length > 10) {
      sendJson(res, 400, { error: '每张主图最多上传 10 张套图' })
      return
    }
    const operatorName = body.operatorName || item.operatorName || '张三'
    const created = files.map((file, index) => ({
      id: `att-${Date.now()}-${index}`,
      imageItemId: item.id,
      fileName: file.fileName || `suite-${current.length + index + 1}`,
      fileUrl: file.fileUrl,
      sortOrder: current.length + index + 1,
      operatorName,
      createdAt: `2026-06-06 ${nowTime()}`,
    }))
    db.attachments.push(...created)
    item.suiteCount = current.length + created.length
    item.operatorName = operatorName
    item.updatedAt = nowTime()
    addLog(db, item.id, `上传套图 ${created.length} 张`, operatorName)
    await writeDb(db)
    sendJson(res, 200, { attachments: [...current, ...created], item })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/manual-upload/confirm') {
    const body = await readJson(req)
    const operatorName = body.operatorName || '张三'
    const archiveDate = body.archiveDate || '2026-06-06'
    const existingCodes = new Set(db.imageItems.map((item) => item.code))
    const created = []
    const skipped = []
    const inputDrafts = Array.isArray(body.drafts) ? body.drafts : []

    inputDrafts.forEach((draft, index) => {
      const code = String(draft.code || '').trim()
      if (!code || existingCodes.has(code)) {
        skipped.push({ code, reason: !code ? '编号为空' : '重复编号' })
        return
      }
      const item = createItemFromDraft({ ...draft, code }, archiveDate, operatorName, index)
      existingCodes.add(item.code)
      created.push(item)
    })

    const batch = created.length > 0
      ? createImportBatch({
          sourceType: 'manual',
          archiveDate,
          totalCount: inputDrafts.length,
          importedCount: created.length,
          skippedCount: skipped.length,
          operatorName,
        })
      : null
    if (batch) db.importBatches.unshift(batch)
    created.forEach((item) => {
      item.batchId = batch?.id
      item.batchName = batch?.name
      addLog(db, item.id, `手动上传入库（${batch?.name || '无批次'}）`, operatorName)
    })

    db.imageItems.unshift(...created)
    await writeDb(db)
    sendJson(res, 200, { items: created, batch, skipped })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/uploads/images') {
    const body = await readJson(req)
    const files = Array.isArray(body.files) ? body.files : []
    const uploaded = []
    for (const file of files) {
      const imageUrl = await saveDataUrlImage(file.dataUrl, file.fileName)
      uploaded.push({ fileName: file.fileName || 'upload', imageUrl })
    }
    sendJson(res, 200, { files: uploaded })
    return
  }

  const attachmentDeleteMatch = url.pathname.match(/^\/api\/image-items\/([^/]+)\/attachments\/([^/]+)$/)
  if (req.method === 'DELETE' && attachmentDeleteMatch) {
    const body = await readJson(req)
    const item = db.imageItems.find((candidate) => candidate.id === attachmentDeleteMatch[1])
    if (!item) {
      sendJson(res, 404, { error: '主图不存在' })
      return
    }
    const beforeCount = db.attachments.length
    const deleted = db.attachments.find((attachment) => attachment.id === attachmentDeleteMatch[2] && attachment.imageItemId === item.id)
    db.attachments = db.attachments.filter((attachment) => !(attachment.id === attachmentDeleteMatch[2] && attachment.imageItemId === item.id))
    if (db.attachments.length === beforeCount) {
      sendJson(res, 404, { error: '套图不存在' })
      return
    }
    const remaining = db.attachments
      .filter((attachment) => attachment.imageItemId === item.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((attachment, index) => ({ ...attachment, sortOrder: index + 1 }))
    db.attachments = db.attachments.filter((attachment) => attachment.imageItemId !== item.id).concat(remaining)
    item.suiteCount = remaining.length
    item.operatorName = body.operatorName || item.operatorName || '张三'
    item.updatedAt = nowTime()
    addLog(db, item.id, `删除套图 ${deleted.fileName}`, item.operatorName)
    await writeDb(db)
    sendJson(res, 200, { attachments: remaining, item })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/import/excel/preview') {
    const body = await readJson(req)
    const preview = await buildExcelPreview(body, db)
    sendJson(res, 200, { preview })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/import/excel/confirm') {
    const body = await readJson(req)
    const operatorName = body.operatorName || '张三'
    const archiveDate = body.archiveDate || '2026-06-06'
    const type = body.type === 'shoulder_bag' ? 'shoulder_bag' : 'hand_bag'
    const existingCodes = new Set(db.imageItems.map((item) => item.code))
    const created = []
    const skipped = []
    const rows = Array.isArray(body.rows) ? body.rows : []

    rows.forEach((row, index) => {
      const code = String(row.code || '').trim()
      if (!code || row.skipReason || existingCodes.has(code)) {
        skipped.push({ code, reason: row.skipReason || (!code ? '编号为空' : '重复编号') })
        return
      }
      const item = createItemFromExcelRow({ ...row, code }, archiveDate, type, operatorName, index)
      existingCodes.add(item.code)
      created.push(item)
    })

    const batch = created.length > 0
      ? createImportBatch({
          sourceType: 'excel',
          archiveDate,
          fileName: body.fileName,
          totalCount: rows.length,
          importedCount: created.length,
          skippedCount: skipped.length,
          operatorName,
        })
      : null
    if (batch) db.importBatches.unshift(batch)
    created.forEach((item) => {
      item.batchId = batch?.id
      item.batchName = batch?.name
      addLog(db, item.id, `Excel 导入入库（${batch?.name || '无批次'}）`, operatorName)
    })

    db.imageItems.unshift(...created)
    await writeDb(db)
    sendJson(res, 200, { items: created, batch, skipped })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/import/excel/mock') {
    const body = await readJson(req)
    const operatorName = body.operatorName || '张三'
    const item = {
      id: `excel-${Date.now()}`,
      code: `A-${Math.floor(3000 + Math.random() * 600)}`,
      name: 'Excel 导入主图',
      type: body.type === 'shoulder_bag' ? 'shoulder_bag' : 'hand_bag',
      archiveDate: body.archiveDate || '2026-06-06',
      status: 'stored',
      requiredQuantity: 60,
      producedQuantity: 0,
      suiteCount: 0,
      imageUrl: sampleImages[2],
      operatorName,
      updatedAt: nowTime(),
      sourceType: 'excel',
    }
    db.imageItems.unshift(item)
    addLog(db, item.id, 'Excel 导入入库', operatorName)
    await writeDb(db)
    sendJson(res, 200, { item })
    return
  }

  if (req.method === 'PATCH' && url.pathname === '/api/image-items/batch-status') {
    const body = await readJson(req)
    const ids = Array.isArray(body.ids) ? Array.from(new Set(body.ids.map((id) => String(id)))) : []
    const status = String(body.status || '')
    const operatorName = body.operatorName || '张三'
    if (ids.length === 0) {
      sendJson(res, 400, { error: '请选择需要修改的主图' })
      return
    }
    if (!imageStatuses.has(status)) {
      sendJson(res, 400, { error: '目标状态不正确' })
      return
    }

    const updated = []
    const skipped = []
    const itemById = new Map(db.imageItems.map((item) => [item.id, item]))
    ids.forEach((id) => {
      const item = itemById.get(id)
      if (!item) {
        skipped.push({ id, reason: '主图不存在' })
        return
      }
      if (item.deletedAt) {
        skipped.push({ id, reason: '已删除主图不可批量改状态' })
        return
      }
      item.status = status
      if (status === 'deleted') {
        item.deletedAt = new Date().toISOString()
      }
      item.operatorName = operatorName
      item.updatedAt = nowTime()
      updated.push(item)
      addLog(db, item.id, `批量改状态为${imageStatusLabels[status]}`, operatorName)
    })

    await writeDb(db)
    sendJson(res, 200, { updated, skipped })
    return
  }

  const itemMatch = url.pathname.match(/^\/api\/image-items\/([^/]+)$/)
  if (req.method === 'PATCH' && itemMatch) {
    const body = await readJson(req)
    const item = db.imageItems.find((candidate) => candidate.id === itemMatch[1])
    if (!item) {
      sendJson(res, 404, { error: '主图不存在' })
      return
    }
    const patch = body.patch || {}
    if (patch.status && !imageStatuses.has(String(patch.status))) {
      sendJson(res, 400, { error: '目标状态不正确' })
      return
    }
    if (patch.status === 'deleted' && patch.deletedAt === undefined) {
      patch.deletedAt = new Date().toISOString()
    }
    Object.assign(item, patch, {
      operatorName: body.operatorName || item.operatorName,
      updatedAt: nowTime(),
    })
    addLog(db, item.id, body.action || '修改主图', item.operatorName)
    await writeDb(db)
    sendJson(res, 200, { item })
    return
  }

  const logsMatch = url.pathname.match(/^\/api\/image-items\/([^/]+)\/logs$/)
  if (req.method === 'GET' && logsMatch) {
    sendJson(res, 200, { logs: db.operationLogs.filter((log) => log.imageItemId === logsMatch[1]) })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/operation-logs') {
    const itemsById = new Map(db.imageItems.map((item) => [item.id, item]))
    const logs = db.operationLogs.map((log) => {
      const item = itemsById.get(log.imageItemId)
      return {
        ...log,
        itemCode: item?.code || '未知编号',
        itemName: item?.name || '主图不存在',
        itemType: item?.type,
        itemStatus: item?.status,
        imageUrl: item?.imageUrl,
        archiveDate: item?.archiveDate,
      }
    })
    sendJson(res, 200, { logs })
    return
  }

  sendJson(res, 404, { error: '接口不存在' })
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(error)
    sendJson(res, 500, { error: error.message || '服务器错误' })
  })
})

server.listen(PORT, HOST, () => {
  console.log(`API server listening on http://localhost:${PORT}`)
})
