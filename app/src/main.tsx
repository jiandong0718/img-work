import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import type { ExcelImportPreview, ImageAttachment, ImageItem, ImageStatus, ImageType, ImportBatch, ManualDraft, OperationLog, OperationLogWithItem, Screen, User } from './types'
import {
  batchUpdateImageStatus,
  confirmExcelImport,
  confirmManualUpload,
  createImageAttachments,
  deleteImageAttachment,
  fetchCurrentUser,
  fetchImageAttachments,
  fetchImageItems,
  fetchImageLogs,
  fetchOperationLogs,
  imagePackageDownloadUrl,
  login,
  logout,
  previewExcelImport,
  updateImageItem,
  uploadImages,
} from './api'

const imageTypeLabels: Record<ImageType, string> = {
  hand_bag: '手提包',
  shoulder_bag: '单肩背包',
}

const statusLabels: Record<ImageStatus, string> = {
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

function safeDownloadName(value: string, fallback = 'image') {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  return normalized || fallback
}

function toDownloadHref(url: string) {
  return new URL(url, window.location.href).href
}

function isActiveItem(item: ImageItem) {
  return !isDeletedItem(item)
}

function isDeletedItem(item: ImageItem) {
  return Boolean(item.deletedAt) || item.status === 'deleted'
}

const initialItems: ImageItem[] = [
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
]

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <path className="logo-bag" d="M15 20.5h18a5 5 0 0 1 4.9 4.1l1.9 10.7A5.2 5.2 0 0 1 34.7 41H13.3a5.2 5.2 0 0 1-5.1-5.7l1.9-10.7a5 5 0 0 1 4.9-4.1Z" />
        <path className="logo-handle" d="M17.2 20.5v-2.4a6.8 6.8 0 0 1 13.6 0v2.4" />
        <path className="logo-line" d="M16.5 28h15" />
        <path className="logo-line" d="M16.5 33h11" />
        <circle className="logo-node" cx="32.5" cy="33" r="2.8" />
      </svg>
    </div>
  )
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [screen, setScreen] = useState<Screen>('archive')
  const [items, setItems] = useState<ImageItem[]>(initialItems)
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [selectedId, setSelectedId] = useState(initialItems[0].id)
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<{ url: string; title: string; subtitle?: string } | null>(null)

  useEffect(() => {
    fetchCurrentUser()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true))
  }, [])

  useEffect(() => {
    if (!authReady || !user) return
    fetchImageItems()
      .then(({ items, batches }) => {
        setItems(items)
        setBatches(batches)
      })
      .catch((error) => setError(error.message))
  }, [authReady, user])

  useEffect(() => {
    if (!user || screen !== 'detail' || !selectedId) return
    Promise.all([fetchImageLogs(selectedId), fetchImageAttachments(selectedId)])
      .then(([logsResult, attachmentsResult]) => {
        setLogs(logsResult.logs)
        setAttachments(attachmentsResult.attachments)
      })
      .catch((error) => setError(error.message))
  }, [screen, selectedId, user])

  async function logoutUser() {
    try {
      await logout()
    } catch (error) {
      setError(error instanceof Error ? error.message : '退出登录失败')
    } finally {
      setUser(null)
      setScreen('archive')
      setSelectedId(initialItems[0].id)
      setLogs([])
      setAttachments([])
    }
  }

  if (!authReady) {
    return (
      <section className="login-page">
        <div className="login-panel">
          <div className="brand">
            <BrandMark />
            <div>
              <strong>图片归档工作台</strong>
              <span>正在确认登录状态</span>
            </div>
          </div>
          <h1>正在进入工作台</h1>
          <p>系统正在检查当前登录会话。</p>
        </div>
        <div className="login-hero" aria-hidden="true">
          <div className="hero-stage">
            <div className="hero-grid" />
            <div className="scan-band" />
          </div>
        </div>
      </section>
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onLogin={async (account, password) => {
          const { user } = await login(account, password)
          setUser(user)
          setError('')
        }}
      />
    )
  }

  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  async function saveManualDrafts(drafts: ManualDraft[], archiveDate: string) {
    if (!user) return
    const { items: created, batch } = await confirmManualUpload(drafts, archiveDate, user.displayName)
    setItems((current) => [...created, ...current])
    if (batch) setBatches((current) => [batch, ...current])
    setScreen('center')
  }

  async function saveExcelRows(preview: ExcelImportPreview, archiveDate: string, type: ImageType) {
    if (!user) return
    const { items: created, batch } = await confirmExcelImport(preview.rows, archiveDate, type, user.displayName, preview.fileName)
    setItems((current) => [...created, ...current])
    if (batch) setBatches((current) => [batch, ...current])
    setScreen('center')
  }

  async function updateItem(id: string, patch: Partial<ImageItem>, action: string) {
    if (!user) return
    const { item: updated } = await updateImageItem(id, patch, action, user.displayName)
    setItems((current) => current.map((item) => (item.id === id ? updated : item)))
    const { logs } = await fetchImageLogs(id)
    setLogs(logs)
  }

  async function batchChangeStatus(ids: string[], status: ImageStatus) {
    if (!user) return
    try {
      const { updated, skipped } = await batchUpdateImageStatus(ids, status, user.displayName)
      setItems((current) => {
        const updatedById = new Map(updated.map((item) => [item.id, item]))
        return current.map((item) => updatedById.get(item.id) ?? item)
      })
      if (skipped.length > 0) {
        setError(`已更新 ${updated.length} 条，跳过 ${skipped.length} 条。`)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '批量修改失败')
      throw error
    }
  }

  async function uploadSuiteImages(id: string, files: Array<{ fileName: string; fileUrl: string }>) {
    if (!user) return
    const { attachments, item: updated } = await createImageAttachments(id, files, user.displayName)
    setAttachments(attachments)
    setItems((current) => current.map((item) => (item.id === id ? updated : item)))
    const { logs } = await fetchImageLogs(id)
    setLogs(logs)
  }

  async function removeSuiteImage(id: string, attachmentId: string) {
    if (!user) return
    const { attachments, item: updated } = await deleteImageAttachment(id, attachmentId, user.displayName)
    setAttachments(attachments)
    setItems((current) => current.map((item) => (item.id === id ? updated : item)))
    const { logs } = await fetchImageLogs(id)
    setLogs(logs)
  }

  function openPreview(url: string, title: string, subtitle?: string) {
    setPreview({ url, title, subtitle })
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={screen === 'detail' ? 'center' : screen === 'manual' || screen === 'excel' ? 'archive' : screen}
        user={user}
        onNavigate={setScreen}
        onLogout={logoutUser}
      />
      <main className="main">
        <Header screen={screen} />
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError('')}>关闭</button>
          </div>
        )}
        {screen === 'archive' && <ArchiveHome items={items} onNavigate={setScreen} />}
        {screen === 'excel' && <ExcelImport onConfirm={saveExcelRows} />}
        {screen === 'manual' && <ManualUpload existingCodes={items.map((item) => item.code)} onSave={saveManualDrafts} />}
        {screen === 'dashboard' && (
          <StatusDashboard
            items={items}
            onOpen={(id) => {
              setSelectedId(id)
              setScreen('detail')
            }}
          />
        )}
        {screen === 'center' && (
          <ImageCenter
            items={items}
            batches={batches}
            onOpen={(id) => {
              setSelectedId(id)
              setScreen('detail')
            }}
            onSoftDelete={(id) => updateItem(id, { deletedAt: new Date().toISOString(), status: 'deleted' }, '软删除主图')}
            onRestore={(id) => updateItem(id, { deletedAt: '', status: 'stored' }, '恢复主图')}
            onBatchStatus={batchChangeStatus}
            onPreview={openPreview}
          />
        )}
        {screen === 'logs' && (
          <OperationLogsView
            onOpen={(id) => {
              setSelectedId(id)
              setScreen('detail')
            }}
          />
        )}
        {screen === 'detail' && selected && (
          <DetailView
            item={selected}
            attachments={attachments.filter((attachment) => attachment.imageItemId === selected.id)}
            logs={logs.filter((log) => log.imageItemId === selected.id)}
            onBack={() => setScreen('center')}
            onUpdate={(patch, action) => updateItem(selected.id, patch, action)}
            onUploadSuite={(files) => uploadSuiteImages(selected.id, files)}
            onDeleteSuite={(attachmentId) => removeSuiteImage(selected.id, attachmentId)}
            onPreview={openPreview}
          />
        )}
      </main>
      {preview && <ImagePreviewModal preview={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (account: string, password: string) => Promise<void> }) {
  const [account, setAccount] = useState('zhangsan')
  const [password, setPassword] = useState('123456')
  const [error, setError] = useState('')

  return (
    <section className="login-page">
      <div className="login-panel">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>图片归档工作台</strong>
            <span>登录后自动记录操作人</span>
          </div>
        </div>
        <h1>登录工作台</h1>
        <p>进入系统后可以导入 Excel、手动上传图片，并在图片中心维护状态和套图。</p>
        <label>
          账号
          <input value={account} onChange={(event) => setAccount(event.target.value)} />
        </label>
        <label>
          密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button
          className="btn primary"
          onClick={() => {
            onLogin(account, password).catch((error) => setError(error.message))
          }}
        >
          登录
        </button>
      </div>
      <div className="login-hero" aria-hidden="true">
        <div className="hero-stage">
          <div className="hero-grid" />
          <div className="scan-band" />
          <img className="hero-photo hero-photo-a" src="/sample/example_pc_1.png" alt="" />
          <img className="hero-photo hero-photo-b" src="/sample/example_pc_2.png" alt="" />
          <img className="hero-photo hero-photo-c" src="/sample/example_mb_1.jpg" alt="" />
          <img className="hero-photo hero-photo-d" src="/sample/example_mb_2.jpg" alt="" />
          <div className="flow-board">
            <div className="flow-row">
              <span>A-2048</span>
              <strong>已入库</strong>
            </div>
            <div className="flow-row">
              <span>A-2081</span>
              <strong>待出图</strong>
            </div>
            <div className="flow-row">
              <span>A-2096</span>
              <strong>待验收</strong>
            </div>
          </div>
          <div className="hero-chip hero-chip-a">Excel</div>
          <div className="hero-chip hero-chip-b">手动上传</div>
          <div className="hero-chip hero-chip-c">图片中心</div>
        </div>
      </div>
    </section>
  )
}

function Sidebar({
  active,
  user,
  onNavigate,
  onLogout,
}: {
  active: Screen
  user: User
  onNavigate: (screen: Screen) => void
  onLogout: () => void
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <strong>图片归档工作台</strong>
          <span>Excel 入库 / 出图 / 生产跟进</span>
        </div>
      </div>
      <nav>
        <button className={active === 'archive' ? 'active' : ''} onClick={() => onNavigate('archive')}>
          图片归档
        </button>
        <button className={active === 'center' ? 'active' : ''} onClick={() => onNavigate('center')}>
          图片中心
        </button>
        <button className={active === 'dashboard' ? 'active' : ''} onClick={() => onNavigate('dashboard')}>
          状态看板
        </button>
        <button className={active === 'logs' ? 'active' : ''} onClick={() => onNavigate('logs')}>
          操作日志
        </button>
      </nav>
      <div className="user-card">
        <strong>{user.displayName}</strong>
        <span>{user.role === 'admin' ? '管理员' : '成员'} · 当前登录用户</span>
        <button onClick={onLogout}>退出登录</button>
      </div>
    </aside>
  )
}

function Header({ screen }: { screen: Screen }) {
  const copy: Record<Screen, [string, string]> = {
    archive: ['图片归档', '选择归档方式：通过 Excel 批量导入，或手动上传图片。'],
    excel: ['Excel 导入', '上传表格后识别图片、编号和排除字样，确认无误再入库。'],
    manual: ['手动上传', '不通过 Excel，直接批量或单张上传图片并保存到归档。'],
    center: ['图片中心', '查看所有已归档图片，并按类型、状态、日期和编号筛选管理。'],
    detail: ['主图详情', '维护当前主图、生产数量、状态、套图和操作记录。'],
    dashboard: ['状态看板', '按状态、类型、来源和生产进度查看当前图片任务。'],
    logs: ['操作日志', '按主图、动作、操作人和日期追溯所有变更记录。'],
  }
  return (
    <header className="topbar">
      <div>
        <h1>{copy[screen][0]}</h1>
        <p>{copy[screen][1]}</p>
      </div>
    </header>
  )
}

function ArchiveHome({ items, onNavigate }: { items: ImageItem[]; onNavigate: (screen: Screen) => void }) {
  const activeItems = items.filter(isActiveItem)
  const today = new Date().toISOString().slice(0, 10)
  const latestItems = [...activeItems]
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0))
    .slice(0, 6)
  const todayCount = activeItems.filter((item) => item.archiveDate === today).length
  const excelCount = activeItems.filter((item) => item.sourceType === 'excel').length
  const manualCount = activeItems.filter((item) => item.sourceType === 'manual').length
  const pendingCount = activeItems.filter((item) => item.status !== 'stored' && item.status !== 'completed').length
  const completedCount = activeItems.filter((item) => item.status === 'completed').length
  const totalRequired = activeItems.reduce((sum, item) => sum + item.requiredQuantity, 0)
  const workflowSteps = ['上传识别', '预览排除', '确认入库', '出图验收', '生产完成']

  return (
    <section className="archive-workbench">
      <div className="entry-grid">
        <article className="entry-card highlight">
          <div>
            <h2>入口 1：Excel 导入</h2>
            <p>适合客户给一整张 Excel 表格的场景，系统自动读取内嵌图片、编号和排除字样。</p>
          </div>
          <button className="btn primary" onClick={() => onNavigate('excel')}>
            开始导入
          </button>
        </article>
        <article className="entry-card">
          <div>
            <h2>入口 2：手动上传</h2>
            <p>适合没有 Excel、临时补图或少量新增的场景，支持批量上传或单张上传。</p>
          </div>
          <button className="btn primary" onClick={() => onNavigate('manual')}>
            手动上传
          </button>
        </article>
      </div>

      <div className="archive-overview">
        <section className="archive-summary">
          <div className="summary-head">
            <div>
              <h2>归档概览</h2>
              <p>当前主图库存、来源和待处理压力会在这里同步变化。</p>
            </div>
            <button className="btn" onClick={() => onNavigate('center')}>
              查看图片中心
            </button>
          </div>
          <div className="metric-grid">
            <div className="metric-card">
              <span>有效主图</span>
              <strong>{activeItems.length}</strong>
              <small>今日归档 {todayCount} 张</small>
            </div>
            <div className="metric-card">
              <span>Excel / 手动</span>
              <strong>
                {excelCount} / {manualCount}
              </strong>
              <small>两种入口最终统一入库</small>
            </div>
            <div className="metric-card">
              <span>出图处理中</span>
              <strong>{pendingCount}</strong>
              <small>待出图与出图中合计</small>
            </div>
            <div className="metric-card">
              <span>需求数量</span>
              <strong>{totalRequired}</strong>
              <small>已完成 {completedCount} 张主图</small>
            </div>
          </div>
        </section>

        <aside className="archive-flow">
          <h2>归档流程</h2>
          <div className="flow-steps">
            {workflowSteps.map((step, index) => (
              <div className="flow-step" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <section className="recent-archive panel">
        <div className="panel-head">
          <div>
            <h2>最近归档</h2>
            <p>快速确认刚导入或刚上传的图片是否进入归档。</p>
          </div>
        </div>
        {latestItems.length > 0 ? (
          <div className="recent-grid">
            {latestItems.map((item) => (
              <button
                className="recent-card"
                key={item.id}
                onClick={() => onNavigate('center')}
                title={`${item.code} ${item.name}`}
              >
                <img src={item.imageUrl} alt={item.name} />
                <strong>{item.code}</strong>
                <span>{imageTypeLabels[item.type]} · {statusLabels[item.status]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-archive">
            <strong>还没有归档图片</strong>
            <span>可以从 Excel 导入或手动上传开始，入库后这里会展示最近的主图。</span>
          </div>
        )}
      </section>
    </section>
  )
}

function ExcelImport({
  onConfirm,
}: {
  onConfirm: (preview: ExcelImportPreview, archiveDate: string, type: ImageType) => Promise<void>
}) {
  const [archiveDate, setArchiveDate] = useState('2026-06-06')
  const [type, setType] = useState<ImageType>('hand_bag')
  const [preview, setPreview] = useState<ExcelImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function fileToText(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      const isExcel = /\.(xlsx|xls)$/iu.test(file.name)
      const content = isExcel ? await fileToDataUrl(file) : await fileToText(file)
      const { preview } = await previewExcelImport(file.name, content, archiveDate, type)
      setPreview(preview)
    } catch (error) {
      setError(error instanceof Error ? error.message : '导入预览失败')
    } finally {
      setLoading(false)
    }
  }

  async function savePreview() {
    if (!preview || preview.importableCount === 0) return
    setSaving(true)
    setError('')
    try {
      await onConfirm(preview, archiveDate, type)
    } catch (error) {
      setError(error instanceof Error ? error.message : '确认入库失败')
      setSaving(false)
    }
  }

  function downloadImportReport() {
    if (!preview) return
    const escapeCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['文件名', '归档日期', '默认类型', '总行数', '可入库', '跳过', '说明'],
      [preview.fileName, archiveDate, imageTypeLabels[type], preview.totalRows, preview.importableCount, preview.skippedCount, preview.message],
      [],
      ['行号', '编号', '名称', '数量', '结果'],
      ...preview.rows.map((row) => [
        row.rowNumber,
        row.code || '-',
        row.name || '-',
        row.requiredQuantity,
        row.skipReason || '可归档',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${preview.fileName.replace(/\.[^.]+$/u, '') || '导入报告'}-导入报告.csv`
    document.body.appendChild(link)
    link.click()
    URL.revokeObjectURL(link.href)
    link.remove()
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Excel 导入预览</h2>
          <p>选择表格后先预览识别结果，确认无误再写入图片中心。</p>
        </div>
        <button className="btn primary" onClick={savePreview} disabled={!preview || preview.importableCount === 0 || saving}>
          {saving ? '入库中...' : `确认 ${preview?.importableCount ?? 0} 条入库`}
        </button>
      </div>
      <div className="form-grid">
        <label>
          归档日期
          <input value={archiveDate} onChange={(event) => setArchiveDate(event.target.value)} />
        </label>
        <label>
          默认图片类型
          <select value={type} onChange={(event) => setType(event.target.value as ImageType)}>
            <option value="hand_bag">手提包</option>
            <option value="shoulder_bag">单肩背包</option>
          </select>
        </label>
      </div>
      <div className="upload-box">
        <strong>选择 Excel / CSV 表格</strong>
        <span>支持 xlsx 内嵌图片解析，也支持 CSV/TSV 文本表格识别。</span>
        <label className="file-button">
          选择表格
          <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0])} />
        </label>
        {loading && <span>解析中...</span>}
        {error && <span className="upload-error">{error}</span>}
      </div>
      {preview && (
        <div className="import-preview">
          <div className="import-summary">
            <strong>{preview.fileName}</strong>
            <span>共 {preview.totalRows} 行</span>
            <span className="tag success">可入库 {preview.importableCount}</span>
            <span className="tag warning">跳过 {preview.skippedCount}</span>
            <button className="btn" onClick={downloadImportReport}>
              下载导入报告
            </button>
          </div>
          <p>{preview.message}</p>
          {preview.rows.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>预览图</th>
                    <th>编号</th>
                    <th>名称</th>
                    <th>数量</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={`${row.rowNumber}-${row.code}`}>
                      <td>{row.rowNumber}</td>
                      <td>
                        <img className="preview-thumb" src={row.imageUrl} alt={row.name} />
                      </td>
                      <td>{row.code || '-'}</td>
                      <td>{row.name || '-'}</td>
                      <td>{row.requiredQuantity}</td>
                      <td>
                        <span className={`tag ${row.skipReason ? 'warning' : 'success'}`}>{row.skipReason || '可归档'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ManualUpload({
  existingCodes,
  onSave,
}: {
  existingCodes: string[]
  onSave: (drafts: ManualDraft[], archiveDate: string) => void
}) {
  const [archiveDate, setArchiveDate] = useState('2026-06-06')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadMessage, setUploadMessage] = useState('')
  const [drafts, setDrafts] = useState<ManualDraft[]>([])

  function updateDraft(id: string, patch: Partial<ManualDraft>) {
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.id !== id) return draft
        const next = { ...draft, ...patch }
        return { ...next, duplicate: existingCodes.includes(next.code.trim()) }
      }),
    )
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  function isSupportedImage(file: File) {
    return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.(png|jpe?g)$/iu.test(file.name)
  }

  async function handleFiles(files: FileList | null) {
    const selected = Array.from(files ?? []).filter(isSupportedImage)
    if (selected.length === 0) {
      setUploadError('请选择 jpg/png 图片')
      setUploadMessage('')
      return
    }
    setUploading(true)
    setUploadError('')
    setUploadMessage(`已选择 ${selected.length} 张图片，正在上传...`)
    try {
      const payload = await Promise.all(
        selected.map(async (file) => ({
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      )
      const { files: uploaded } = await uploadImages(payload)
      setDrafts((current) => [
        ...current,
        ...uploaded.map((file, index) => ({
          id: `upload-${Date.now()}-${index}`,
          fileName: file.fileName,
          code: '',
          name: file.fileName.replace(/\.[^.]+$/u, ''),
          type: 'hand_bag' as ImageType,
          requiredQuantity: 1,
          imageUrl: file.imageUrl,
          duplicate: false,
        })),
      ])
      setUploadMessage(`已加入 ${uploaded.length} 张待归档图片，请补充编号后保存。`)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '上传失败')
      setUploadMessage('')
    } finally {
      setUploading(false)
    }
  }

  const validCount = drafts.filter((draft) => draft.code.trim() && !draft.duplicate).length
  const removeDraft = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id))

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>手动上传工作区</h2>
          <p>支持批量上传或单张上传。每张图片保存后都会进入图片中心。</p>
        </div>
        <button className="btn primary" onClick={() => onSave(drafts, archiveDate)} disabled={validCount === 0}>
          保存 {validCount} 条到归档
        </button>
      </div>
      <div className="manual-layout">
        <div>
          <div className="upload-box">
            <strong>选择 jpg/png 图片</strong>
            <span>支持一次选择多张；上传后逐张填写编号、类型和数量。</span>
            <label className="file-button">
              选择图片
              <input
                type="file"
                accept="image/png,image/jpeg,.jpg,.jpeg,.png"
                multiple
                onChange={(event) => {
                  handleFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
            </label>
            {uploading && <span>上传中...</span>}
            {uploadMessage && <span className="upload-success">{uploadMessage}</span>}
            {uploadError && <span className="upload-error">{uploadError}</span>}
          </div>
          <label>
            归档日期
            <input value={archiveDate} onChange={(event) => setArchiveDate(event.target.value)} />
          </label>
        </div>
        <div className="draft-grid">
          {drafts.length === 0 ? (
            <div className="empty-archive">
              <strong>还没有待归档图片</strong>
              <span>点击左侧“选择图片”，上传真实 jpg/png 图片后再填写编号、类型和数量。</span>
            </div>
          ) : (
            drafts.map((draft) => (
              <article className="draft-card" key={draft.id}>
                <button className="draft-remove" onClick={() => removeDraft(draft.id)} aria-label={`移除${draft.fileName}`}>
                  移除
                </button>
                <img src={draft.imageUrl} alt={draft.fileName} />
                <div className="draft-fields">
                  <input value={draft.code} placeholder="编号" onChange={(event) => updateDraft(draft.id, { code: event.target.value })} />
                  <input value={draft.name} placeholder="名称" onChange={(event) => updateDraft(draft.id, { name: event.target.value })} />
                  <select value={draft.type} onChange={(event) => updateDraft(draft.id, { type: event.target.value as ImageType })}>
                    <option value="hand_bag">手提包</option>
                    <option value="shoulder_bag">单肩背包</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={draft.requiredQuantity}
                    onChange={(event) => updateDraft(draft.id, { requiredQuantity: Number(event.target.value) })}
                  />
                  <span className={`tag ${draft.duplicate ? 'warning' : 'success'}`}>{draft.duplicate ? '重复编号' : '可归档'}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function StatusDashboard({ items, onOpen }: { items: ImageItem[]; onOpen: (id: string) => void }) {
  const activeItems = items.filter(isActiveItem)
  const totalRequired = activeItems.reduce((sum, item) => sum + item.requiredQuantity, 0)
  const totalProduced = activeItems.reduce((sum, item) => sum + item.producedQuantity, 0)
  const productionRate = totalRequired > 0 ? Math.round((totalProduced / totalRequired) * 100) : 0
  const today = new Date().toISOString().slice(0, 10)
  const todayCount = activeItems.filter((item) => item.archiveDate === today).length
  const waitingItems = activeItems
    .filter((item) => item.status !== 'completed')
    .sort((a, b) => {
      const priority: Record<ImageStatus, number> = {
        pending_review: 1,
        need_revision: 2,
        revised: 3,
        pending_acceptance: 4,
        pending_design: 5,
        designing: 6,
        pending_production: 7,
        production: 8,
        stored: 9,
        completed: 10,
        deleted: 11,
      }
      return priority[a.status] - priority[b.status]
    })
  const waitingPreview = waitingItems
    .slice(0, 8)
  const statusRows = Object.entries(statusLabels).map(([status, label]) => {
    const count = activeItems.filter((item) => item.status === status).length
    const percent = activeItems.length > 0 ? Math.round((count / activeItems.length) * 100) : 0
    return { status: status as ImageStatus, label, count, percent }
  })
  const typeRows = Object.entries(imageTypeLabels).map(([type, label]) => {
    const count = activeItems.filter((item) => item.type === type).length
    const percent = activeItems.length > 0 ? Math.round((count / activeItems.length) * 100) : 0
    return { type: type as ImageType, label, count, percent }
  })
  const sourceRows = [
    {
      label: 'Excel 导入',
      tone: 'source-excel',
      count: activeItems.filter((item) => item.sourceType === 'excel').length,
    },
    {
      label: '手动上传',
      tone: 'source-manual',
      count: activeItems.filter((item) => item.sourceType === 'manual').length,
    },
  ].map((row) => ({
    ...row,
    percent: activeItems.length > 0 ? Math.round((row.count / activeItems.length) * 100) : 0,
  }))

  return (
    <section className="dashboard">
      <div className="dashboard-kpis">
        <div className="metric-card">
          <span>有效主图</span>
          <strong>{activeItems.length}</strong>
          <small>今日归档 {todayCount} 张</small>
        </div>
        <div className="metric-card">
          <span>待处理主图</span>
          <strong>{waitingItems.length}</strong>
          <small>不含已完成状态</small>
        </div>
        <div className="metric-card">
          <span>生产数量</span>
          <strong>{totalProduced}</strong>
          <small>需求数量 {totalRequired}</small>
        </div>
        <div className="metric-card">
          <span>生产进度</span>
          <strong>{productionRate}%</strong>
          <small>按已生产 / 需求数量计算</small>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>状态分布</h2>
              <p>用于判断当前主要卡在哪个环节。</p>
            </div>
          </div>
          <div className="bar-list">
            {statusRows.map((row) => (
              <div className={`bar-row tone-${row.status}`} key={row.status}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.count} 张</span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${row.percent}%` }} />
                </div>
                <em>{row.percent}%</em>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>类型与来源</h2>
              <p>查看主图来源和品类结构。</p>
            </div>
          </div>
          <div className="split-bars">
            <div>
              <h3>图片类型</h3>
              {typeRows.map((row) => (
                <div className={`compact-bar tone-${row.type}`} key={row.type}>
                  <span>{row.label}</span>
                  <div className="bar-track">
                    <span style={{ width: `${row.percent}%` }} />
                  </div>
                  <strong>{row.count}</strong>
                </div>
              ))}
            </div>
            <div>
              <h3>归档来源</h3>
              {sourceRows.map((row) => (
                <div className={`compact-bar tone-${row.tone}`} key={row.label}>
                  <span>{row.label}</span>
                  <div className="bar-track">
                    <span style={{ width: `${row.percent}%` }} />
                  </div>
                  <strong>{row.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>待处理队列</h2>
            <p>优先展示需修改、待验收、待出图等未完成图片，点击可进入详情。</p>
          </div>
        </div>
        {waitingPreview.length > 0 ? (
          <div className="queue-list">
            {waitingPreview.map((item) => (
              <button className="queue-item" key={item.id} onClick={() => onOpen(item.id)}>
                <img src={item.imageUrl} alt={item.name} />
                <div>
                  <strong>{item.code}</strong>
                  <span>{item.name}</span>
                </div>
                <span className="tag info">{statusLabels[item.status]}</span>
                <small>{imageTypeLabels[item.type]}</small>
                <small>
                  {item.producedQuantity} / {item.requiredQuantity}
                </small>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-archive">
            <strong>暂无待处理图片</strong>
            <span>未完成状态的主图会出现在这里。</span>
          </div>
        )}
      </section>
    </section>
  )
}

function ImageCenter({
  items,
  batches,
  onOpen,
  onSoftDelete,
  onRestore,
  onBatchStatus,
  onPreview,
}: {
  items: ImageItem[]
  batches: ImportBatch[]
  onOpen: (id: string) => void
  onSoftDelete: (id: string) => void
  onRestore: (id: string) => void
  onBatchStatus: (ids: string[], status: ImageStatus) => Promise<void>
  onPreview: (url: string, title: string, subtitle?: string) => void
}) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | ImageType>('all')
  const [status, setStatus] = useState<'all' | ImageStatus>('all')
  const [archiveDate, setArchiveDate] = useState('')
  const [batchId, setBatchId] = useState('all')
  const [deleteView, setDeleteView] = useState<'active' | 'deleted' | 'all'>('active')
  const [page, setPage] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [batchStatus, setBatchStatus] = useState<ImageStatus>('pending_design')
  const [batchSaving, setBatchSaving] = useState(false)
  const pageSize = 10

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchesQuery = !query || item.code.includes(query) || item.name.includes(query)
        const matchesType = type === 'all' || item.type === type
        const matchesStatus = status === 'all' || item.status === status
        const matchesDate = !archiveDate || item.archiveDate === archiveDate
        const matchesBatch = batchId === 'all' || item.batchId === batchId
        const itemDeleted = isDeletedItem(item)
        const matchesDelete = deleteView === 'all' || (deleteView === 'deleted' ? itemDeleted : !itemDeleted)
        return matchesQuery && matchesType && matchesStatus && matchesDate && matchesBatch && matchesDelete
      }),
    [archiveDate, batchId, deleteView, items, query, status, type],
  )

  useEffect(() => {
    setPage(1)
  }, [archiveDate, batchId, deleteView, query, status, type])

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => filtered.some((item) => item.id === id && !isDeletedItem(item))))
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeCount = items.filter(isActiveItem).length
  const selectablePagedIds = paged.filter(isActiveItem).map((item) => item.id)
  const selectedCount = selectedIds.length
  const allPagedSelected = selectablePagedIds.length > 0 && selectablePagedIds.every((id) => selectedIds.includes(id))

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id]
      return current.filter((selectedId) => selectedId !== id)
    })
  }

  function togglePage(checked: boolean) {
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => !selectablePagedIds.includes(id))
      return Array.from(new Set([...current, ...selectablePagedIds]))
    })
  }

  async function submitBatchStatus() {
    if (selectedIds.length === 0) return
    setBatchSaving(true)
    try {
      await onBatchStatus(selectedIds, batchStatus)
      setSelectedIds([])
    } finally {
      setBatchSaving(false)
    }
  }

  function downloadFilteredReport() {
    const escapeCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['编号', '名称', '图片类型', '状态', '归档日期', '批次', '需求数量', '已生产数量', '套图数量', '来源', '操作人', '删除状态'],
      ...filtered.map((item) => [
        item.code,
        item.name,
        imageTypeLabels[item.type],
        statusLabels[item.status],
        item.archiveDate,
        item.batchName || '-',
        item.requiredQuantity,
        item.producedQuantity,
        item.suiteCount,
        item.sourceType === 'excel' ? 'Excel 导入' : '手动上传',
        item.operatorName,
        isDeletedItem(item) ? '已删除' : '有效',
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${safeDownloadName(`图片中心-${new Date().toISOString().slice(0, 10)}`, '图片中心')}.csv`
    document.body.appendChild(link)
    link.click()
    URL.revokeObjectURL(link.href)
    link.remove()
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>图片中心</h2>
          <p>有效 {activeCount} 条主图，当前筛选 {filtered.length} 条，已选 {selectedCount} 条。</p>
        </div>
        <button className="btn" onClick={downloadFilteredReport} disabled={filtered.length === 0}>
          导出当前筛选
        </button>
      </div>
      <div className="filters">
        <label>
          搜索编号/名称
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="A-20" />
        </label>
        <label>
          图片类型
          <select value={type} onChange={(event) => setType(event.target.value as 'all' | ImageType)}>
            <option value="all">全部类型</option>
            <option value="hand_bag">手提包</option>
            <option value="shoulder_bag">单肩背包</option>
          </select>
        </label>
        <label>
          状态
          <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | ImageStatus)}>
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          归档日期
          <input value={archiveDate} onChange={(event) => setArchiveDate(event.target.value)} placeholder="2026-06-06" />
        </label>
        <label>
          导入批次
          <select value={batchId} onChange={(event) => setBatchId(event.target.value)}>
            <option value="all">全部批次</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}（{batch.importedCount}）
              </option>
            ))}
          </select>
        </label>
        <label>
          删除状态
          <select value={deleteView} onChange={(event) => setDeleteView(event.target.value as 'active' | 'deleted' | 'all')}>
            <option value="active">仅有效</option>
            <option value="deleted">已删除</option>
            <option value="all">全部</option>
          </select>
        </label>
      </div>
      <div className="batch-bar">
        <div>
          <strong>批量状态流转</strong>
          <span>先勾选主图，再选择目标状态。</span>
        </div>
        <select value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as ImageStatus)}>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={submitBatchStatus} disabled={selectedCount === 0 || batchSaving}>
          {batchSaving ? '提交中...' : `修改 ${selectedCount} 条`}
        </button>
        <button className="btn" onClick={() => setSelectedIds([])} disabled={selectedCount === 0 || batchSaving}>
          清空选择
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="select-col">
                <input
                  type="checkbox"
                  checked={allPagedSelected}
                  onChange={(event) => togglePage(event.target.checked)}
                  aria-label="选择当前页"
                />
              </th>
              <th>主图</th>
              <th>类型</th>
              <th>状态</th>
              <th>归档日期</th>
              <th>批次</th>
              <th>数量</th>
              <th>套图</th>
              <th>操作人</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((item) => {
              const itemDeleted = isDeletedItem(item)
              return (
                <tr key={item.id} className={itemDeleted ? 'deleted-row' : ''}>
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      disabled={itemDeleted}
                      onChange={(event) => toggleOne(item.id, event.target.checked)}
                      aria-label={`选择${item.code}`}
                    />
                  </td>
                  <td>
                    <div className="item-cell">
                      <button
                        className="thumb-button"
                        onClick={() => onPreview(item.imageUrl, item.code, item.name)}
                        aria-label={`预览${item.code}`}
                      >
                        <img src={item.imageUrl} alt={item.name} />
                      </button>
                      <div>
                        <strong>{item.code}</strong>
                        <span>{item.name}</span>
                      </div>
                    </div>
                  </td>
                  <td>{imageTypeLabels[item.type]}</td>
                  <td>
                    <span className="tag info">{statusLabels[item.status]}</span>
                    {itemDeleted && item.status !== 'deleted' && <span className="tag warning">已删除</span>}
                  </td>
                  <td>{item.archiveDate}</td>
                  <td>{item.batchName || '-'}</td>
                  <td>
                    {item.requiredQuantity} / {item.producedQuantity}
                  </td>
                  <td>{item.suiteCount} / 10</td>
                  <td>{item.operatorName}</td>
                  <td>
                    <div className="row-actions">
                      <button className="link-btn" onClick={() => onOpen(item.id)}>
                        详情
                      </button>
                      {itemDeleted ? (
                        <button className="link-btn" onClick={() => onRestore(item.id)}>
                          恢复
                        </button>
                      ) : (
                        <button
                          className="link-btn danger"
                          onClick={() => {
                            if (window.confirm(`确认删除主图「${item.code}」吗？`)) onSoftDelete(item.id)
                          }}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <span>
          第 {currentPage} / {totalPages} 页
        </span>
        <div>
          <button className="btn" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1}>
            上一页
          </button>
          <button className="btn" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={currentPage >= totalPages}>
            下一页
          </button>
        </div>
      </div>
    </section>
  )
}

function OperationLogsView({ onOpen }: { onOpen: (id: string) => void }) {
  const [logs, setLogs] = useState<OperationLogWithItem[]>([])
  const [query, setQuery] = useState('')
  const [operator, setOperator] = useState('')
  const [status, setStatus] = useState<'all' | ImageStatus>('all')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetchOperationLogs()
      .then(({ logs }) => {
        setLogs(logs)
        setError('')
      })
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false))
  }, [])

  const operators = useMemo(() => Array.from(new Set(logs.map((log) => log.operatorName).filter(Boolean))), [logs])
  const filtered = useMemo(
    () =>
      logs.filter((log) => {
        const matchesQuery =
          !query ||
          log.itemCode.includes(query) ||
          log.itemName.includes(query) ||
          log.action.includes(query)
        const matchesOperator = !operator || log.operatorName === operator
        const matchesStatus = status === 'all' || log.itemStatus === status
        const matchesDate = !date || log.createdAt.startsWith(date)
        return matchesQuery && matchesOperator && matchesStatus && matchesDate
      }),
    [date, logs, operator, query, status],
  )

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>操作日志</h2>
          <p>共 {logs.length} 条记录，当前筛选 {filtered.length} 条。</p>
        </div>
      </div>
      <div className="filters">
        <label>
          搜索编号/名称/动作
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="A-2048 / 上传套图" />
        </label>
        <label>
          操作人
          <select value={operator} onChange={(event) => setOperator(event.target.value)}>
            <option value="">全部操作人</option>
            {operators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          当前状态
          <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | ImageStatus)}>
            <option value="all">全部状态</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          操作日期
          <input value={date} onChange={(event) => setDate(event.target.value)} placeholder="2026-06-06" />
        </label>
      </div>
      {loading && <div className="empty-archive">日志加载中...</div>}
      {error && <div className="save-state dirty">{error}</div>}
      {!loading && !error && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>主图</th>
                <th>动作</th>
                <th>状态</th>
                <th>操作人</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td>
                    <div className="item-cell">
                      {log.imageUrl && <img src={log.imageUrl} alt={log.itemName} />}
                      <div>
                        <strong>{log.itemCode}</strong>
                        <span>{log.itemName}</span>
                      </div>
                    </div>
                  </td>
                  <td>{log.action}</td>
                  <td>{log.itemStatus ? <span className="tag info">{statusLabels[log.itemStatus]}</span> : '-'}</td>
                  <td>{log.operatorName}</td>
                  <td>{log.createdAt}</td>
                  <td>
                    <button className="link-btn" onClick={() => onOpen(log.imageItemId)}>
                      详情
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-table">暂无匹配日志</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function DetailView({
  item,
  attachments,
  logs,
  onBack,
  onUpdate,
  onUploadSuite,
  onDeleteSuite,
  onPreview,
}: {
  item: ImageItem
  attachments: ImageAttachment[]
  logs: OperationLog[]
  onBack: () => void
  onUpdate: (patch: Partial<ImageItem>, action: string) => void
  onUploadSuite: (files: Array<{ fileName: string; fileUrl: string }>) => Promise<void>
  onDeleteSuite: (attachmentId: string) => Promise<void>
  onPreview: (url: string, title: string, subtitle?: string) => void
}) {
  const [draft, setDraft] = useState({
    status: item.status,
    type: item.type,
    requiredQuantity: item.requiredQuantity,
    producedQuantity: item.producedQuantity,
  })
  const [savedMessage, setSavedMessage] = useState('')
  const [suiteMessage, setSuiteMessage] = useState('')
  const [suiteError, setSuiteError] = useState('')
  const [suiteUploading, setSuiteUploading] = useState(false)

  useEffect(() => {
    setDraft({
      status: item.status,
      type: item.type,
      requiredQuantity: item.requiredQuantity,
      producedQuantity: item.producedQuantity,
    })
    setSavedMessage('')
    setSuiteMessage('')
    setSuiteError('')
  }, [item.id, item.producedQuantity, item.requiredQuantity, item.status, item.type])

  const isDirty =
    draft.status !== item.status ||
    draft.type !== item.type ||
    draft.requiredQuantity !== item.requiredQuantity ||
    draft.producedQuantity !== item.producedQuantity

  function saveDraft() {
    if (!isDirty) return
    const changed = []
    if (draft.status !== item.status) changed.push(`状态改为${statusLabels[draft.status]}`)
    if (draft.type !== item.type) changed.push(`图片类型改为${imageTypeLabels[draft.type]}`)
    if (draft.requiredQuantity !== item.requiredQuantity) changed.push('修改需求数量')
    if (draft.producedQuantity !== item.producedQuantity) changed.push('修改已生产数量')
    onUpdate(draft, changed.join('，'))
    setSavedMessage('修改已保存')
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  function isSupportedImage(file: File) {
    return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/jpg' || /\.(png|jpe?g)$/iu.test(file.name)
  }

  function downloadFile(url: string) {
    const link = document.createElement('a')
    link.href = toDownloadHref(url)
    link.download = safeDownloadName(item.code)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function handleSuiteFiles(files: FileList | null) {
    const selected = Array.from(files ?? []).filter(isSupportedImage)
    if (selected.length === 0) {
      setSuiteError('请选择 jpg/png 套图')
      setSuiteMessage('')
      return
    }
    if (attachments.length + selected.length > 10) {
      setSuiteError(`最多 10 张套图，当前还可上传 ${Math.max(0, 10 - attachments.length)} 张`)
      setSuiteMessage('')
      return
    }
    setSuiteUploading(true)
    setSuiteError('')
    setSuiteMessage(`正在上传 ${selected.length} 张套图...`)
    try {
      const payload = await Promise.all(
        selected.map(async (file) => ({
          fileName: file.name,
          dataUrl: await fileToDataUrl(file),
        })),
      )
      const { files: uploaded } = await uploadImages(payload)
      await onUploadSuite(uploaded.map((file) => ({ fileName: file.fileName, fileUrl: file.imageUrl })))
      setSuiteMessage(`已上传 ${uploaded.length} 张套图`)
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : '套图上传失败')
      setSuiteMessage('')
    } finally {
      setSuiteUploading(false)
    }
  }

  async function deleteAttachment(attachment: ImageAttachment) {
    if (!window.confirm(`确认删除套图「${attachment.fileName}」吗？`)) return
    setSuiteError('')
    setSuiteMessage('')
    try {
      await onDeleteSuite(attachment.id)
      setSuiteMessage('套图已删除')
    } catch (error) {
      setSuiteError(error instanceof Error ? error.message : '删除套图失败')
    }
  }

  return (
    <>
      <div className="detail-page-toolbar">
        <button className="btn back-btn" onClick={onBack}>
          返回图片中心
        </button>
        <div>
          <strong>{item.code}</strong>
          <span>
            {imageTypeLabels[item.type]} · {statusLabels[item.status]} · {item.archiveDate}
          </span>
        </div>
      </div>
      <section className="detail-layout">
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>{item.code} 主图</h2>
            <p>从图片中心进入详情。</p>
          </div>
        </div>
        <button className="detail-image-button" onClick={() => onPreview(item.imageUrl, item.code, item.name)}>
          <img className="detail-image" src={item.imageUrl} alt={item.name} />
        </button>
        <div className="stat-grid">
          <div>
            <span>需求数量</span>
            <strong>{item.requiredQuantity}</strong>
          </div>
          <div>
            <span>已生产</span>
            <strong>{item.producedQuantity}</strong>
          </div>
          <div>
            <span>套图</span>
            <strong>{attachments.length}/10</strong>
          </div>
        </div>
        <div className="download-actions">
          <button className="btn" onClick={() => downloadFile(item.imageUrl)}>
            下载主图
          </button>
          <button className="btn primary" onClick={() => downloadFile(imagePackageDownloadUrl(item.id))}>
            打包下载
          </button>
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>详情维护</h2>
            <p>编辑字段后点击保存，系统会记录当前登录用户。</p>
          </div>
          <div className="detail-actions">
            <button className="btn primary" onClick={saveDraft} disabled={!isDirty}>
              保存修改
            </button>
          </div>
        </div>
        {(isDirty || savedMessage) && <div className={`save-state ${isDirty ? 'dirty' : 'saved'}`}>{isDirty ? '有未保存修改' : savedMessage}</div>}
        {suiteMessage && <div className="save-state saved">{suiteMessage}</div>}
        {suiteError && <div className="save-state dirty">{suiteError}</div>}
        <div className="form-grid">
          <label>
            当前状态
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ImageStatus }))}>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            图片类型
            <select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as ImageType }))}>
              <option value="hand_bag">手提包</option>
              <option value="shoulder_bag">单肩背包</option>
            </select>
          </label>
          <label>
            需求数量
            <input
              type="number"
              min="0"
              value={draft.requiredQuantity}
              onChange={(event) => setDraft((current) => ({ ...current, requiredQuantity: Number(event.target.value) }))}
            />
          </label>
          <label>
            已生产数量
            <input
              type="number"
              min="0"
              value={draft.producedQuantity}
              onChange={(event) => setDraft((current) => ({ ...current, producedQuantity: Number(event.target.value) }))}
            />
          </label>
        </div>
        <div className="attachments">
          <div className="attachments-head">
            <h3>套图</h3>
            <div className="attachments-actions">
              <span>{attachments.length}/10</span>
              <label className={`btn file-action ${attachments.length >= 10 ? 'disabled' : ''}`}>
                上传套图
                <input
                  type="file"
                  accept="image/png,image/jpeg,.jpg,.jpeg,.png"
                  multiple
                  disabled={attachments.length >= 10 || suiteUploading}
                  onChange={(event) => {
                    handleSuiteFiles(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          </div>
          {attachments.length === 0 ? (
            <p>暂无套图</p>
          ) : (
            <div className="attachment-grid">
              {attachments.map((attachment) => (
                <article className="attachment-card" key={attachment.id}>
                  <button className="attachment-preview" onClick={() => onPreview(attachment.fileUrl, `第 ${attachment.sortOrder} 张套图`, attachment.fileName)}>
                    <img src={attachment.fileUrl} alt={attachment.fileName} />
                  </button>
                  <div>
                    <strong>第 {attachment.sortOrder} 张</strong>
                    <span>{attachment.fileName}</span>
                  </div>
                  <div className="attachment-actions">
                    <button className="link-btn" onClick={() => downloadFile(attachment.fileUrl)}>
                      下载
                    </button>
                    <button className="link-btn danger" onClick={() => deleteAttachment(attachment)}>
                      删除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="logs">
          <h3>操作日志</h3>
          {logs.length === 0 ? (
            <p>暂无日志</p>
          ) : (
            logs.map((log) => (
              <div className="log-item" key={log.id}>
                <strong>{log.action}</strong>
                <span>
                  {log.operatorName} · {log.createdAt}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      </section>
    </>
  )
}

function ImagePreviewModal({
  preview,
  onClose,
}: {
  preview: { url: string; title: string; subtitle?: string }
  onClose: () => void
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function downloadFile() {
    const link = document.createElement('a')
    link.href = toDownloadHref(preview.url)
    link.download = safeDownloadName(preview.title)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="图片预览" onClick={onClose}>
      <div className="preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="preview-head">
          <div>
            <h2>{preview.title}</h2>
            {preview.subtitle && <p>{preview.subtitle}</p>}
          </div>
          <div className="preview-actions">
            <button className="btn" onClick={downloadFile}>
              下载
            </button>
            <button className="btn primary" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="preview-stage">
          <img src={preview.url} alt={preview.title} />
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
