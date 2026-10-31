import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Database, RefreshCw, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import type { CatalogEntry, CatalogStatus } from '@/types/api'
import { regimeShort } from '@/lib/format'

type CatalogProps = {
  status: CatalogStatus | null
  onUpdated: () => void
  onNavigateToLegal: (appendix: number, position: number) => void
}

export function Catalog({ status, onUpdated, onNavigateToLegal }: CatalogProps) {
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [query, setQuery] = useState('')
  const [appendix, setAppendix] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      api.catalog(query, appendix)
        .then((data) => setEntries(data.items))
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить справочник.'))
        .finally(() => setLoading(false))
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query, appendix])

  async function upload(file: File) {
    setError('')
    setMessage('')

    try {
      const document = JSON.parse(await file.text())
      const result = await api.updateCatalog(document)
      setMessage(`Справочник обновлён: ${result.items} позиций, версия ${result.version}.`)
      onUpdated()
      const data = await api.catalog(query, appendix)
      setEntries(data.items)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить файл.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="catalog-view">
      <div className="catalog-intro">
        <div><span className="section-label">Локальная база НПА</span><h2>Справочник</h2></div>
        <p>{status?.document}<br />Версия данных: {status?.version || '—'} · {status?.items || 0} позиций</p>
      </div>

      <div className="catalog-update">
        <div><Database size={22} /><span><strong>Обновление без передеплоя</strong><small>JSON со схемой version + items. Старый справочник заменяется только после успешной валидации.</small></span></div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => event.target.files?.[0] && upload(event.target.files[0])} />
        <button className="button button--secondary" type="button" onClick={() => fileRef.current?.click()}><Upload size={17} />Загрузить JSON</button>
      </div>

      {message && <p className="form-message form-message--success"><Check size={17} />{message}</p>}
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}

      <div className="catalog-toolbar">
        <label className="search-field"><span className="sr-only">Поиск по справочнику</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или код ОКПД2" /></label>
        <div className="filter-group" aria-label="Фильтр по приложению">
          {[null, 1, 2, 3].map((value) => <button key={String(value)} className={appendix === value ? 'active' : ''} type="button" onClick={() => setAppendix(value)}>{value ? `Прил. ${value}` : 'Все'}</button>)}
        </div>
      </div>

      {loading ? (
        <p className="loading-line"><RefreshCw className="spin" size={18} />Загружаем позиции…</p>
      ) : (
        <div className="catalog-list">
          {entries.map((item: CatalogEntry) => (
            <article className="catalog-entry" key={item.id}>
              <button className="catalog-position legal-inline-link" type="button" onClick={() => onNavigateToLegal(item.appendix, item.position)}>
                {item.appendix}.{item.position}
              </button>
              <div>
                <h3><button className="catalog-name-link legal-inline-link" type="button" onClick={() => onNavigateToLegal(item.appendix, item.position)}>{item.name}</button></h3>
                <p><button className="legal-inline-link" type="button" onClick={() => onNavigateToLegal(item.appendix, item.position)}>{regimeShort(item.regime)}</button>{item.quota_percent !== null ? ` · ${item.quota_percent}%` : ''}</p>
              </div>
              <code>{item.okpd2}</code>
              <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Источник: ${item.legal_reference}`}><ArrowUpRight size={18} /></a>
            </article>
          ))}
          {!entries.length && <p className="empty-state">По вашему запросу ничего не найдено.</p>}
        </div>
      )}
    </section>
  )
}
