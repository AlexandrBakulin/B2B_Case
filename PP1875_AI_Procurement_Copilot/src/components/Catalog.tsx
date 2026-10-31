import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Database, RefreshCw, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import type { CatalogEntry, CatalogStatus } from '@/types/api'
import { regimeShort } from '@/lib/format'

export function Catalog({ status, onUpdated }: { status: CatalogStatus | null; onUpdated: () => void }) {
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
      api.catalog(query, appendix).then((data) => setEntries(data.items)).catch((e) => setError(e.message)).finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [query, appendix])

  async function upload(file: File) {
    setError(''); setMessage('')
    try {
      const document = JSON.parse(await file.text())
      const result = await api.updateCatalog(document)
      setMessage(`Справочник обновлён: ${result.items} позиций, версия ${result.version}.`)
      onUpdated()
      const data = await api.catalog(query, appendix)
      setEntries(data.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл')
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
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button className="button button--secondary" type="button" onClick={() => fileRef.current?.click()}><Upload size={17} />Загрузить JSON</button>
      </div>
      {message && <p className="form-message form-message--success"><Check size={17} />{message}</p>}
      {error && <p className="form-message form-message--error">{error}</p>}
      <div className="catalog-toolbar">
        <label className="search-field"><span className="sr-only">Поиск по справочнику</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название или код ОКПД2" /></label>
        <div className="filter-group" aria-label="Фильтр по приложению">
          {[null, 1, 2, 3].map((value) => <button key={String(value)} className={appendix === value ? 'active' : ''} type="button" onClick={() => setAppendix(value)}>{value ? `Прил. ${value}` : 'Все'}</button>)}
        </div>
      </div>
      {loading ? <p className="loading-line"><RefreshCw className="spin" size={18} />Загружаем позиции…</p> : (
        <div className="catalog-list">
          {entries.map((item) => <article className="catalog-entry" key={item.id}>
            <span className="catalog-position">{item.appendix}.{item.position}</span>
            <div><h3>{item.name}</h3><p>{regimeShort(item.regime)}{item.quota_percent !== null ? ` · ${item.quota_percent}%` : ''}</p></div>
            <code>{item.okpd2}</code>
            <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Источник: ${item.legal_reference}`}><ArrowUpRight size={18} /></a>
          </article>)}
          {!entries.length && <p className="empty-state">По вашему запросу ничего не найдено.</p>}
        </div>
      )}
    </section>
  )
}
