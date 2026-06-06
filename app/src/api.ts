import type { ExcelImportPreview, ExcelImportRow, ImageAttachment, ImageItem, ImageType, ManualDraft, OperationLog, User } from './types'

const API_BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || '请求失败')
  }
  return data as T
}

export function login(account: string, password: string) {
  return request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  })
}

export function fetchImageItems() {
  return request<{ items: ImageItem[] }>('/image-items')
}

export function confirmManualUpload(drafts: ManualDraft[], archiveDate: string, operatorName: string) {
  return request<{ items: ImageItem[]; skipped: Array<{ code: string; reason: string }> }>('/manual-upload/confirm', {
    method: 'POST',
    body: JSON.stringify({ drafts, archiveDate, operatorName }),
  })
}

export function uploadImages(files: Array<{ fileName: string; dataUrl: string }>) {
  return request<{ files: Array<{ fileName: string; imageUrl: string }> }>('/uploads/images', {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
}

export function mockExcelImport(archiveDate: string, type: ImageType, operatorName: string) {
  return request<{ item: ImageItem }>('/import/excel/mock', {
    method: 'POST',
    body: JSON.stringify({ archiveDate, type, operatorName }),
  })
}

export function previewExcelImport(fileName: string, content: string, archiveDate: string, type: ImageType) {
  return request<{ preview: ExcelImportPreview }>('/import/excel/preview', {
    method: 'POST',
    body: JSON.stringify({ fileName, content, archiveDate, type }),
  })
}

export function confirmExcelImport(rows: ExcelImportRow[], archiveDate: string, type: ImageType, operatorName: string) {
  return request<{ items: ImageItem[]; skipped: Array<{ code: string; reason: string }> }>('/import/excel/confirm', {
    method: 'POST',
    body: JSON.stringify({ rows, archiveDate, type, operatorName }),
  })
}

export function updateImageItem(id: string, patch: Partial<ImageItem>, action: string, operatorName: string) {
  return request<{ item: ImageItem }>(`/image-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ patch, action, operatorName }),
  })
}

export function fetchImageLogs(id: string) {
  return request<{ logs: OperationLog[] }>(`/image-items/${id}/logs`)
}

export function fetchImageAttachments(id: string) {
  return request<{ attachments: ImageAttachment[] }>(`/image-items/${id}/attachments`)
}

export function createImageAttachments(id: string, files: Array<{ fileName: string; fileUrl: string }>, operatorName: string) {
  return request<{ attachments: ImageAttachment[]; item: ImageItem }>(`/image-items/${id}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ files, operatorName }),
  })
}

export function deleteImageAttachment(id: string, attachmentId: string, operatorName: string) {
  return request<{ attachments: ImageAttachment[]; item: ImageItem }>(`/image-items/${id}/attachments/${attachmentId}`, {
    method: 'DELETE',
    body: JSON.stringify({ operatorName }),
  })
}

export function imagePackageDownloadUrl(id: string) {
  return `${API_BASE}/image-items/${id}/download-package`
}
