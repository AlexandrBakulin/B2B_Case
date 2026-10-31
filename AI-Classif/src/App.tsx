import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowRight, BookOpen, Check, FileSpreadsheet, LoaderCircle, Play, Scale, ShieldCheck, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { BatchResponse, CatalogStatus, ClassificationResult } from '@/types/api'
import { BatchResults, SingleResult } from '@/components/Results'
import { Catalog } from '@/components/Catalog'
import { LegalDocument } from '@/components/LegalDocument'

type View = 'classifier' | 'catalog' | 'legal'
type LegalTarget = { appendix: number; position: number } | null
type ApiConnectionState = 'checking' | 'online' | 'starting' | 'offline'

function targetFromHash(): LegalTarget {
  const match = window.location.hash.match(/^#pp1875-appendix-([123])-position-(\d+)$/)
  return match ? { appendix: Number(match[1]), position: Number(match[2]) } : null
}

const examples = ['Ноутбук портативный', 'Подшипник шариковый', 'Аппарат ИВЛ']

function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\uFEFF/, ''))
    .filter(Boolean)
    .map((line) => line.split(/[;\t]/)[0].trim().replace(/^"|"$/g, ''))
    .filter((line, index) => index > 0 || !/^(наименование|товар|query|name)$/i.test(line))
}

function App() {
  const initialTarget = targetFromHash()
  const [view, setView] = useState<View>(initialTarget ? 'legal' : 'classifier')
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [status, setStatus] = useState<CatalogStatus | null>(null)
  const [connectionState, setConnectionState] = useState<ApiConnectionState>('checking')
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ClassificationResult | null>(null)
  const [batchText, setBatchText] = useState('')
  const [batch, setBatch] = useState<BatchResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [jobState, setJobState] = useState('')
  const [error, setError] = useState('')
  const [legalTarget, setLegalTarget] = useState<LegalTarget>(initialTarget)
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<number | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await api.status()
      setStatus(nextStatus)
      setConnectionState(nextStatus.model_ready && nextStatus.items > 0 ? 'online' : 'starting')
    } catch {
      setStatus(null)
      setConnectionState('offline')
    }
  }, [])

  const openLegalPosition = useCallback((appendix: number, position: number) => {
    setLegalTarget({ appendix, position })
    setView('legal')
  }, [])

  useEffect(() => {
    void refreshStatus()
    // Retry automatically: a temporary API startup / proxy failure must not leave
    // the header stuck forever in "Подключение…".
    const statusTimer = window.setInterval(() => { void refreshStatus() }, 5000)
    const handleHashChange = () => {
      const target = targetFromHash()
      if (target) {
        setLegalTarget(target)
        setView('legal')
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.clearInterval(statusTimer)
      if (pollRef.current !== null) window.clearTimeout(pollRef.current)
    }
  }, [refreshStatus])

  async function classify(value = query) {
    const clean = value.trim()
    if (clean.length < 2) {
      setError('Введите наименование товара — не менее двух символов.')
      return
    }

    setBusy(true)
    setError('')
    setResult(null)
    setQuery(clean)

    try {
      setResult(await api.classify(clean))
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Ошибка классификации')
    } finally {
      setBusy(false)
    }
  }

  async function startBatch() {
    const items = parseLines(batchText)
    if (!items.length) {
      setError('Добавьте хотя бы одно наименование.')
      return
    }
    if (items.length > 100) {
      setError(`В списке ${items.length} позиций. За один запрос можно обработать не более 100.`)
      return
    }

    setBusy(true)
    setError('')
    setBatch(null)
    setJobState('Отправляем в очередь…')

    try {
      const job = await api.createBatch(items)
      const poll = async () => {
        try {
          const response = await api.job(job.job_id)
          if (response.result) {
            setBatch(response.result)
            setBusy(false)
            setJobState('')
            return
          }
          if (response.status === 'failure') throw new Error(response.error || 'Ошибка обработки')

          setJobState(response.status === 'started' ? 'Модель сравнивает векторы…' : 'Задание ожидает worker…')
          pollRef.current = window.setTimeout(poll, 800)
        } catch (cause: unknown) {
          setError(cause instanceof Error ? cause.message : 'Ошибка задания')
          setBusy(false)
          setJobState('')
        }
      }
      await poll()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Ошибка запуска')
      setBusy(false)
      setJobState('')
    }
  }

  async function importFile(file: File) {
    setError('')
    if (file.size > 1_000_000) {
      setError('Файл слишком большой. Максимум 1 МБ.')
      return
    }

    try {
      const text = await file.text()
      setBatchText(parseLines(text).join('\n'))
    } catch {
      setError('Не удалось прочитать файл. Проверьте его кодировку и формат.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function exportCsv() {
    if (!batch) return

    const escape = (value: string | number | null) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      ['Наименование', 'ОКПД2', 'Приложение', 'Позиция', 'Режим', 'Квота, %', 'Уверенность модели, %', 'Ссылка'],
      ...batch.results.map((item) => [
        item.query,
        item.match.okpd2,
        item.match.appendix,
        item.match.position,
        item.match.regime_label,
        item.match.quota_percent,
        item.match.confidence,
        item.match.source_url,
      ]),
    ]

    const blob = new Blob(['\uFEFF' + rows.map((row) => row.map(escape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = 'pp1875-results.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setView('classifier') }} aria-label="На главную">
          <span className="brand__mark"><Scale size={21} /></span>
          <span><strong>ПП 1875</strong><small>procurement copilot</small></span>
        </button>

        <nav aria-label="Основная навигация">
          <button className={view === 'classifier' ? 'active' : ''} type="button" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setView('classifier') }}>Классификатор</button>
          <button className={view === 'catalog' ? 'active' : ''} type="button" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setView('catalog') }}>Справочник</button>
          <button className={view === 'legal' ? 'active' : ''} type="button" onClick={() => { setLegalTarget(null); window.history.replaceState(null, '', window.location.pathname); setView('legal') }}>
            <BookOpen size={15} /> ПП1875 (импортозамещение)
          </button>
        </nav>

        <button
          className="system-status"
          type="button"
          onClick={() => { void refreshStatus() }}
          title={connectionState === 'offline' ? 'API недоступен. Нажмите, чтобы повторить проверку.' : 'Обновить статус подключения'}
          aria-live="polite"
        >
          <span className={`status-dot ${connectionState === 'offline' ? 'status-dot--offline' : connectionState === 'online' ? 'status-dot--online' : 'status-dot--wait'}`} />
          {connectionState === 'online' && status
            ? `${status.items} позиций · онлайн`
            : connectionState === 'starting'
              ? 'Модель загружается…'
              : connectionState === 'offline'
                ? 'API недоступен · повторить'
                : 'Проверяем API…'}
        </button>
      </header>

      <main>
        {view === 'catalog' ? (
          <Catalog status={status} onUpdated={refreshStatus} onNavigateToLegal={openLegalPosition} />
        ) : view === 'legal' ? (
          <LegalDocument target={legalTarget} status={status} />
        ) : (
          <>
            <section className="hero">
              <div className="hero__main">
                <div className="hero__eyebrow"><span className="hero__eyebrow-mark" /><span>AI PROCUREMENT / 1875</span><span className="hero__eyebrow-rule" /></div>
                <span className="section-label">Интеллектуальный помощник закупщика</span>
                <h1>Товар —<br /><em>на своём месте.</em></h1>
                <div className="hero__signature"><span className="hero__signature-line" /><span>44-ФЗ</span><i /> <span>223-ФЗ</span><i /> <span>НАЦИОНАЛЬНЫЙ РЕЖИМ</span></div>
              </div>
              <div className="hero__aside">
                <div className="hero__aside-top"><span><span className="hero__aside-dot" />СИСТЕМА КЛАССИФИКАЦИИ</span><code>LOCAL / 01</code></div>
                <p>Семантический поиск по приложениям Постановления Правительства РФ № 1875. Код ОКПД2, национальный режим и переход к позиции документа — в одном результате.</p>
                <div className="hero__metrics" aria-label="Возможности классификатора">
                  <div><strong>03</strong><span>приложения<br />ПП № 1875</span></div>
                  <div><strong>100</strong><span>товаров<br />за один запрос</span></div>
                  <div><strong>384</strong><span>измерения<br />вектора</span></div>
                </div>
                <span className="hero__privacy"><ShieldCheck size={17} />Данные и запросы не покидают ваш контур</span>
              </div>
              <div className="hero__watermark" aria-hidden="true">1875</div>
            </section>

            <section className="workspace">
              <div className="workspace-topline">
                <div className="workspace-topline__title"><span>01</span><div><small>РАБОЧАЯ ОБЛАСТЬ</small><strong>Новая классификация</strong></div></div>
                <div className="workspace-topline__meta"><span className="workspace-pulse" />СЕМАНТИЧЕСКИЙ АНАЛИЗ <i /> ПП РФ № 1875</div>
              </div>
              <div className="workspace-tabs" role="tablist" aria-label="Режим классификации">
                <button role="tab" aria-selected={mode === 'single'} className={mode === 'single' ? 'active' : ''} onClick={() => { setMode('single'); setError('') }} type="button">Один товар</button>
                <button role="tab" aria-selected={mode === 'batch'} className={mode === 'batch' ? 'active' : ''} onClick={() => { setMode('batch'); setError('') }} type="button">Список до 100</button>
              </div>

              {mode === 'single' ? (
                <div className="single-panel">
                  <div className="classify-form">
                    <label htmlFor="product-name">Наименование товара</label>
                    <p>Укажите товар так, как он назван в закупочной документации. Можно добавить характеристики или код.</p>
                    <div className="query-box">
                      <textarea
                        id="product-name"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') classify() }}
                        placeholder="Например, сервер стоечный 2U"
                        maxLength={2000}
                        disabled={busy}
                      />
                      <div>
                        <span>{query.length} / 2000</span>
                        <button className="button button--primary" type="button" onClick={() => classify()} disabled={busy || !query.trim()}>
                          {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                          {busy ? 'Анализируем…' : 'Классифицировать'}
                          <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="examples"><span>Попробовать:</span>{examples.map((example) => <button key={example} type="button" onClick={() => classify(example)} disabled={busy}>{example}</button>)}</div>
                  </div>

                  <aside className="method-note">
                    <span className="section-label">Что получите</span>
                    <ol>
                      <li><span>01</span>Точную позицию приложения и код ОКПД2</li>
                      <li><span>02</span>Оценку уверенности модели и альтернативы</li>
                      <li><span>03</span>Национальный режим: запрет, ограничение или квоту</li>
                    </ol>
                    <small>Результат помогает специалисту, но не заменяет юридическую проверку закупки.</small>
                  </aside>
                </div>
              ) : (
                <div className="batch-panel">
                  <div className="batch-input-heading">
                    <div><label htmlFor="batch-names">Список наименований</label><p>Одна позиция на строку. Поддерживаются TXT и CSV с товаром в первом столбце.</p></div>
                    <span>{parseLines(batchText).length} / 100</span>
                  </div>
                  <textarea
                    id="batch-names"
                    className="batch-textarea"
                    value={batchText}
                    onChange={(event) => setBatchText(event.target.value)}
                    placeholder={'Ноутбук портативный\nМонитор 27 дюймов\nКран мостовой электрический'}
                    disabled={busy}
                  />
                  <div className="batch-controls">
                    <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(event) => event.target.files?.[0] && importFile(event.target.files[0])} />
                    <button className="button button--secondary" type="button" onClick={() => fileRef.current?.click()} disabled={busy}><FileSpreadsheet size={18} />Импорт CSV / TXT</button>
                    {batchText && <button className="button button--ghost" type="button" onClick={() => { setBatchText(''); setBatch(null) }} disabled={busy}><X size={17} />Очистить</button>}
                    <button className="button button--primary push-right" type="button" onClick={startBatch} disabled={busy || !batchText.trim()}>
                      {busy ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
                      {busy ? jobState : 'Обработать список'}
                    </button>
                  </div>
                </div>
              )}

              {error && <div className="form-message form-message--error" role="alert">{error}</div>}
            </section>

            {result && mode === 'single' && <SingleResult result={result} onNavigateToLegal={openLegalPosition} />}
            {batch && mode === 'batch' && (
              <section className="batch-output">
                <div className="batch-output__heading">
                  <div>
                    <span className="section-label">Обработка завершена</span>
                    <h2>{batch.count} {batch.count === 1 ? 'результат' : 'результатов'}</h2>
                    <p><Check size={16} />{(batch.duration_ms / 1000).toFixed(2)} сек. · нажмите на строку для подробностей</p>
                  </div>
                  <button className="button button--secondary" type="button" onClick={exportCsv}><ArrowDownToLine size={18} />Скачать CSV</button>
                </div>
                <BatchResults results={batch.results} onNavigateToLegal={openLegalPosition} />
              </section>
            )}
          </>
        )}
      </main>

      <footer>
        <span>AI Procurement Copilot · 44-ФЗ / 223-ФЗ</span>
        <span>Локальная модель · PostgreSQL + pgvector</span>
      </footer>
    </div>
  )
}

export default App
