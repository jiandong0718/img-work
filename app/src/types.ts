export type Screen = 'archive' | 'center' | 'manual' | 'excel' | 'detail' | 'dashboard' | 'logs' | 'users'

export type ImageType = 'hand_bag' | 'shoulder_bag'

export type ImageStatus =
  | 'pending_review'
  | 'stored'
  | 'pending_design'
  | 'designing'
  | 'pending_acceptance'
  | 'need_revision'
  | 'revised'
  | 'pending_production'
  | 'production'
  | 'completed'
  | 'deleted'

export interface User {
  id: string
  account: string
  displayName: string
  role: 'admin' | 'member'
  status?: 'active' | 'disabled'
  createdAt?: string
}

export interface ImageItem {
  id: string
  code: string
  name: string
  type: ImageType
  archiveDate: string
  status: ImageStatus
  requiredQuantity: number
  producedQuantity: number
  suiteCount: number
  imageUrl: string
  operatorName: string
  updatedAt: string
  sourceType: 'excel' | 'manual'
  batchId?: string
  batchCode?: string
  batchName?: string
  deletedAt?: string
}

export interface ImportBatch {
  id: string
  code?: string
  name: string
  sourceType: 'excel' | 'manual'
  archiveDate: string
  fileName?: string
  totalCount: number
  importedCount: number
  skippedCount: number
  operatorName: string
  createdAt: string
}

export interface ManualDraft {
  id: string
  fileName: string
  code: string
  name: string
  type: ImageType
  requiredQuantity: number
  imageUrl: string
  duplicate: boolean
}

export interface OperationLog {
  id: string
  imageItemId?: string | null
  action: string
  operatorName: string
  createdAt: string
  scope?: 'image' | 'auth'
}

export interface OperationLogWithItem extends OperationLog {
  itemCode: string
  itemName: string
  itemType?: ImageType
  itemStatus?: ImageStatus
  imageUrl?: string
  archiveDate?: string
}

export interface BatchStatusResult {
  updated: ImageItem[]
  skipped: Array<{ id: string; reason: string }>
}

export interface ImageAttachment {
  id: string
  imageItemId: string
  fileName: string
  fileUrl: string
  sortOrder: number
  operatorName: string
  createdAt: string
}

export interface ExcelImportRow {
  rowNumber: number
  code: string
  name: string
  requiredQuantity: number
  imageUrl: string
  skipReason: string
  include?: boolean
}

export interface ExcelImportPreview {
  fileName: string
  totalRows: number
  importableCount: number
  skippedCount: number
  message: string
  rows: ExcelImportRow[]
}
