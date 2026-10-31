import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileText, LoaderCircle, UploadCloud } from 'lucide-react'
import { api } from '@/lib/api'
import type { DocumentStatus } from '@/types/api'

export function DocumentIngest() {
  const [document, setDocument] = useState<DocumentStatus | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!document || document.status === 'completed' || document.status === 'failed') return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        const latest = await api.documentStatus(document.document_id)
        if (!cancelled) setDocument(latest)
      } catch (cause: unknown) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось получить статус документа.')
      }
    }, 1400)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [document])

  async function handleFile(file?: File) {
    if (!file) return
    setError('')
    setDocument(null)
    setFileName(file.name)
    setUploading(true)
    try {
      const job = await api.uploadDocument(file)
      const initial = await api.documentStatus(job.document_id)
      setDocument(initial)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить документ.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <section className="document-ingest" aria-labelledby="document-ingest-title">
      <div className="document-ingest__heading">
        <div className="document-ingest__icon"><FileText size={20} /></div>
        <div>
          <span className="section-label">Асинхронная обработка документов</span>
          <h2 id="document-ingest-title">Разобрать PDF или DOCX</h2>
          <p>Загрузите нормативный или закупочный документ. Файл передаётся в очередь Celery/Redis, поэтому запрос на загрузку не ждёт окончания разбора даже для документов объёмом более 50 страниц.</p>
        </div>
      </div>
      <div className="document-ingest__actions">
        <input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
        <button className="button button--primary" type="button" onClick={() => inputRef.current?.click()} disabled={uploading || (document?.status === 'queued' || document?.status === 'processing')}>
          {uploading ? <LoaderCircle className="spin" size={17} /> : <UploadCloud size={17} />}
          {uploading ? 'Загружаем…' : 'Выбрать документ'}
        </button>
        <span>PDF / DOCX · до 100 МБ · лимит PDF до 2 000 страниц</span>
      </div>
      {error && <p className="document-ingest__error" role="alert"><AlertCircle size={17} />{error}</p>}
      {document && (
        <div className={`document-ingest__result document-ingest__result--${document.status}`} aria-live="polite">
          <div className="document-ingest__status">
            {document.status === 'completed' ? <CheckCircle2 size={18} /> : document.status === 'failed' ? <AlertCircle size={18} /> : <LoaderCircle className="spin" size={18} />}
            <div><strong>{document.filename || fileName}</strong><span>{document.status === 'queued' ? 'Ожидает обработки worker…' : document.status === 'processing' ? 'Извлекаем текст в фоновом режиме…' : document.status === 'completed' ? 'Обработка завершена' : 'Не удалось обработать документ'}</span></div>
          </div>
          {document.status === 'completed' && (
            <>
              <div className="document-ingest__meta">
                <span>{document.page_count ?? '—'} {document.page_count_is_estimate ? 'стр. (оценка для DOCX)' : 'стр.'}</span>
                <span>{document.extracted_chars.toLocaleString('ru-RU')} символов извлечено</span>
                {document.download_text_url && <a href={document.download_text_url}><Download size={15} />Скачать текст</a>}
              </div>
              <pre className="document-ingest__preview">{document.preview}{document.extracted_chars > document.preview.length ? '\n\n… Предпросмотр сокращён. Скачайте TXT, чтобы увидеть весь текст.' : ''}</pre>
            </>
          )}
          {document.status === 'failed' && <p className="document-ingest__error">{document.error || 'Неизвестная ошибка обработки.'}</p>}
        </div>
      )}
    </section>
  )
}
