import type { BatchResponse, CatalogStatus, ClassificationResult } from '@/types/api'

const API_BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = Array.isArray(detail)
      ? detail.map((error) => error.msg).join('; ')
      : detail || `Ошибка сервера (${response.status})`
    throw new Error(message)
  }
  return response.json()
}

export const api = {
  status: () => request<CatalogStatus>('/catalog/status'),
  classify: (query: string) => request<ClassificationResult>('/classify', {
    method: 'POST', body: JSON.stringify({ query, top_k: 3 }),
  }),
  createBatch: (items: string[]) => request<{ job_id: string; status: string }>('/jobs', {
    method: 'POST', body: JSON.stringify({ items, top_k: 3 }),
  }),
  batch: (items: string[]) => request<BatchResponse>('/classify/batch', {
    method: 'POST', body: JSON.stringify({ items, top_k: 3 }),
  }),
  job: (id: string) => request<{ status: string; result?: BatchResponse; error?: string }>(`/jobs/${id}`),
  catalog: (q: string, appendix: number | null) => request<{ items: import('@/types/api').CatalogEntry[] }>(
    `/catalog?q=${encodeURIComponent(q)}&limit=100${appendix ? `&appendix=${appendix}` : ''}`,
  ),
  updateCatalog: (document: unknown) => request<{ version: string; items: number }>('/catalog', {
    method: 'PUT', body: JSON.stringify(document),
  }),
}
