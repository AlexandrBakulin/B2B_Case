import type { BatchResponse, CatalogStatus, ClassificationResult, CatalogEntry, DocumentStatus } from '@/types/api'

const API_BASE = '/api/v1'
const CATALOG_PAGE_SIZE = 100

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = Array.isArray(detail)
      ? detail.map((error: { msg?: string }) => error.msg).filter(Boolean).join('; ')
      : detail || `Ошибка сервера (${response.status})`
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export const api = {
  status: () => request<CatalogStatus>('/catalog/status'),

  classify: (query: string) => request<ClassificationResult>('/classify', {
    method: 'POST',
    body: JSON.stringify({ query, top_k: 3 }),
  }),

  createBatch: (items: string[]) => request<{ job_id: string; status: string }>('/jobs', {
    method: 'POST',
    body: JSON.stringify({ items, top_k: 3 }),
  }),

  batch: (items: string[]) => request<BatchResponse>('/classify/batch', {
    method: 'POST',
    body: JSON.stringify({ items, top_k: 3 }),
  }),

  job: (id: string) => request<{ status: string; result?: BatchResponse; error?: string }>(`/jobs/${encodeURIComponent(id)}`),

  catalog: (q: string, appendix: number | null, offset = 0, limit = CATALOG_PAGE_SIZE) => {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      offset: String(offset),
    })
    if (appendix) params.set('appendix', String(appendix))
    return request<{ items: CatalogEntry[]; limit: number; offset: number }>(`/catalog?${params.toString()}`)
  },

  /** Загружает справочник целиком, используя поддерживаемую API пагинацию. */
  catalogAll: async (): Promise<CatalogEntry[]> => {
    const allItems: CatalogEntry[] = []
    let offset = 0

    while (true) {
      const page = await api.catalog('', null, offset, CATALOG_PAGE_SIZE)
      allItems.push(...page.items)

      if (page.items.length < CATALOG_PAGE_SIZE) break
      offset += page.items.length
    }

    return allItems
  },



  uploadDocument: async (file: File): Promise<{ document_id: string; task_id: string; status: string; filename: string }> => {
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(`${API_BASE}/documents`, { method: 'POST', body: form })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error(body?.detail || `Ошибка загрузки (${response.status})`)
    }
    return response.json()
  },

  documentStatus: (id: string) => request<DocumentStatus>(`/documents/${encodeURIComponent(id)}`),

  updateCatalog: (document: unknown) => request<{ version: string; items: number }>('/catalog', {
    method: 'PUT',
    body: JSON.stringify(document),
  }),
}
