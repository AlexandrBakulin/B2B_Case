import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, ExternalLink, FileText, LoaderCircle, Search } from 'lucide-react'
import { api } from '@/lib/api'
import type { CatalogEntry, CatalogStatus } from '@/types/api'
import { regimeShort } from '@/lib/format'
import { DocumentIngest } from '@/components/DocumentIngest'

type LegalTarget = {
  appendix: number
  position: number
} | null

type LegalDocumentProps = {
  target: LegalTarget
  status: CatalogStatus | null
}

const appendixInfo = {
  1: {
    title: 'Приложение № 1',
    subtitle: 'Запрет закупок иностранных товаров',
    description: 'Перечень товаров, в отношении которых устанавливается запрет закупок иностранного происхождения.',
    regime: 'prohibition',
    source: 'https://www.consultant.ru/document/cons_doc_LAW_494318/dc1993c2b5c2478f2ab15f73dba12882e6b458c8/',
  },
  2: {
    title: 'Приложение № 2',
    subtitle: 'Ограничение закупок иностранных товаров',
    description: 'Перечень товаров, в отношении которых устанавливается ограничение закупок иностранного происхождения.',
    regime: 'restriction',
    source: 'https://www.consultant.ru/document/cons_doc_LAW_494318/b0541e42afa5defcd0520054f0979f05aff711fb/',
  },
  3: {
    title: 'Приложение № 3',
    subtitle: 'Минимальная обязательная доля закупок',
    description: 'Перечень товаров и минимальная обязательная доля закупок товаров российского происхождения по 223-ФЗ.',
    regime: 'quota',
    source: 'https://www.consultant.ru/document/cons_doc_LAW_494318/3040cb5a1945ab3d2bbe52797e35a36534993493/',
  },
} as const

function positionId(appendix: number, position: number) {
  return `pp1875-appendix-${appendix}-position-${position}`
}

export function LegalDocument({ target, status }: LegalDocumentProps) {
  const [items, setItems] = useState<CatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<number | null>(target?.appendix ?? null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false

    api.catalogAll()
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить позиции постановления.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setFilter(target?.appendix ?? null)
    if (target) setQuery('')
  }, [target?.appendix, target?.position])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU')
    return items.filter((item) => {
      const matchesAppendix = filter === null || item.appendix === filter
      const searchable = `${item.name} ${item.okpd2} ${item.position} ${item.legal_reference}`.toLocaleLowerCase('ru-RU')
      return matchesAppendix && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [filter, items, query])

  useEffect(() => {
    if (!target || loading) return

    const targetId = positionId(target.appendix, target.position)
    const itemElement = window.document.getElementById(targetId)
    const sectionElement = window.document.getElementById(`pp1875-appendix-${target.appendix}`)
    const element = itemElement ?? sectionElement
    const resolvedId = itemElement ? targetId : sectionElement?.id
    if (!element || !resolvedId) return

    const scrollTimer = window.setTimeout(() => {
      // A real hash makes the destination linkable and lets the browser restore the fragment.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${resolvedId}`)
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (element instanceof HTMLElement) element.focus({ preventScroll: true })
    }, 100)

    return () => window.clearTimeout(scrollTimer)
  }, [filteredItems, loading, target])

  const counts = useMemo(() => ({
    1: items.filter((item) => item.appendix === 1).length,
    2: items.filter((item) => item.appendix === 2).length,
    3: items.filter((item) => item.appendix === 3).length,
  }), [items])

  return (
    <section className="legal-view">
      <div className="legal-hero">
        <div className="legal-hero__icon"><BookOpen size={25} /></div>
        <div className="legal-hero__copy">
          <span className="section-label">Нормативная база · импортозамещение</span>
          <h1>ПП 1875</h1>
          <p>Постановление Правительства Российской Федерации от 23.12.2024 № 1875 «О мерах по предоставлению национального режима при осуществлении закупок».</p>
        </div>
        <a className="button button--secondary legal-hero__source" href="https://www.consultant.ru/document/cons_doc_LAW_494318/" target="_blank" rel="noreferrer">
          Полный текст постановления <ExternalLink size={16} />
        </a>
      </div>

      <div className="legal-notice">
        <FileText size={18} />
        <p>
          Ниже представлены позиции трёх приложений из подключённого локального справочника. Для правовой проверки и учёта последних редакций откройте официальный текст постановления.
          {status?.version ? <span> Версия локального справочника: <strong>{status.version}</strong>.</span> : null}
        </p>
      </div>

      <DocumentIngest />

      <section className="legal-reference-file" aria-labelledby="legal-reference-file-title">
        <div className="legal-reference-file__heading">
          <div>
            <span className="section-label">Загруженный материал</span>
            <h2 id="legal-reference-file-title">Памятка по ПП № 1875</h2>
            <p>Пять страниц обзорного материала, приложенного к проекту. Это справка по основным правилам, а не полный официальный текст постановления и его приложений.</p>
          </div>
          <a className="button button--secondary" href="/docs/pp1875-overview.pdf" target="_blank" rel="noreferrer">Открыть PDF <ExternalLink size={16} /></a>
        </div>
        <iframe className="legal-reference-file__viewer" src="/docs/pp1875-overview.pdf#page=1" title="Загруженная памятка по постановлению № 1875" loading="lazy" />
      </section>

      <div className="legal-stats" aria-label="Количество позиций по приложениям">
        <div><span>Приложение № 1</span><strong>{loading ? '—' : counts[1]}</strong><small>Запрет</small></div>
        <div><span>Приложение № 2</span><strong>{loading ? '—' : counts[2]}</strong><small>Ограничение</small></div>
        <div><span>Приложение № 3</span><strong>{loading ? '—' : counts[3]}</strong><small>Квота 223-ФЗ</small></div>
        <div><span>Всего в справочнике</span><strong>{loading ? '—' : items.length}</strong><small>Позиций</small></div>
      </div>

      <div className="legal-toolbar">
        <div className="legal-filters" aria-label="Выбор приложения">
          <button type="button" className={filter === null ? 'active' : ''} onClick={() => setFilter(null)}>Все</button>
          <button type="button" className={filter === 1 ? 'active' : ''} onClick={() => setFilter(1)}>Запрет · № 1</button>
          <button type="button" className={filter === 2 ? 'active' : ''} onClick={() => setFilter(2)}>Ограничение · № 2</button>
          <button type="button" className={filter === 3 ? 'active' : ''} onClick={() => setFilter(3)}>Квота · № 3</button>
        </div>
        <label className="legal-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти товар, позицию или ОКПД2" />
        </label>
      </div>

      {loading ? (
        <div className="legal-loading"><LoaderCircle className="spin" size={21} /> Загружаем позиции постановления…</div>
      ) : error ? (
        <div className="form-message form-message--error" role="alert">{error}</div>
      ) : (
        <div className="legal-sections">
          {([1, 2, 3] as const).filter((appendix) => filter === null || filter === appendix).map((appendix) => {
            const sectionItems = filteredItems.filter((item) => item.appendix === appendix)
            const info = appendixInfo[appendix]
            if (query.trim() && sectionItems.length === 0) return null

            return (
              <section className="legal-section" id={`pp1875-appendix-${appendix}`} key={appendix}>
                <div className="legal-section__heading">
                  <div>
                    <span className="section-label">{info.title}</span>
                    <h2>{info.subtitle}</h2>
                    <p>{info.description}</p>
                  </div>
                  <div className="legal-section__meta">
                    <span>{sectionItems.length} поз.</span>
                    <a href={info.source} target="_blank" rel="noreferrer" aria-label={`Открыть официальный текст: ${info.title}`}>
                      Официальный текст <ArrowUpRight size={16} />
                    </a>
                  </div>
                </div>

                {sectionItems.length ? (
                  <div className="legal-list">
                    {sectionItems.map((item) => {
                      const isTarget = target?.appendix === item.appendix && target.position === item.position
                      return (
                        <article
                          className={`legal-entry ${isTarget ? 'legal-entry--active' : ''}`}
                          id={positionId(item.appendix, item.position)}
                          key={item.id}
                          tabIndex={-1}
                        >
                          <span className="legal-entry__number">{item.position}</span>
                          <div className="legal-entry__main">
                            <h3>{item.name}</h3>
                            <div className="legal-entry__meta">
                              <span>ОКПД2: <code>{item.okpd2}</code></span>
                              <span>{regimeShort(item.regime)}</span>
                              {item.quota_percent !== null && <strong>Минимальная доля: {item.quota_percent}%</strong>}
                            </div>
                            <p>{item.legal_reference}</p>
                          </div>
                          <a className="legal-entry__source" href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Открыть источник для позиции ${item.position}`}>
                            <ArrowUpRight size={18} />
                          </a>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <p className="empty-state">В этом приложении ничего не найдено по запросу.</p>
                )}
              </section>
            )
          })}
          {!filteredItems.length && <p className="empty-state legal-empty">По запросу «{query}» ничего не найдено.</p>}
        </div>
      )}
    </section>
  )
}
