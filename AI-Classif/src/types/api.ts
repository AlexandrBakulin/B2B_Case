export type Alternative = {
  id: string
  name: string
  okpd2: string
  appendix: 1 | 2 | 3
  position: number
  regime: 'prohibition' | 'restriction' | 'quota'
  regime_label: string
  legal_reference: string
  source_url: string
  quota_percent: number | null
  similarity: number
  confidence: number
}

export type ClassificationResult = {
  query: string
  match: Alternative
  alternatives: Alternative[]
  needs_review: boolean
  explanation: string
  duration_ms: number
}

export type BatchResponse = {
  results: ClassificationResult[]
  count: number
  duration_ms: number
}

export type CatalogStatus = {
  items: number
  version: string
  document: string
  source_url: string
  retrieved_at: string
  model: string
  model_ready: boolean
}

export type CatalogEntry = Omit<Alternative, 'similarity' | 'confidence'>


export type DocumentStatus = {
  document_id: string
  filename: string
  file_type: 'pdf' | 'docx'
  status: 'queued' | 'processing' | 'completed' | 'failed' | string
  page_count: number | null
  page_count_is_estimate: boolean
  extracted_chars: number
  preview: string
  error: string | null
  created_at: string | null
  completed_at: string | null
  download_text_url: string | null
}
