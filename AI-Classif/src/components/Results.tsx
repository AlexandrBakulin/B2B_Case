import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, FileCheck2, FileText } from 'lucide-react'
import type { ClassificationResult } from '@/types/api'
import { regimeShort } from '@/lib/format'

type LegalNavigation = (appendix: number, position: number) => void

/** Показывает оценку сходства, которую формирует классификатор. */
export function Confidence({ value, large = false }: { value: number; large?: boolean }) {
  const safeValue = Math.min(100, Math.max(0, value))
  const radius = 18
  const circumference = 2 * Math.PI * radius

  return (
    <div className={`confidence-wrap ${large ? 'confidence-wrap--large' : ''}`}>
      <div
        className={`confidence ${large ? 'confidence--large' : ''}`}
        role="img"
        aria-label={`Уверенность модели: ${safeValue.toFixed(1)} процентов`}
        title="Оценка семантического сходства запроса с позицией справочника. Не является вероятностью юридической применимости нормы."
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle className="confidence__track" cx="22" cy="22" r={radius} />
          <circle
            className="confidence__value"
            cx="22"
            cy="22"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - safeValue / 100)}
          />
        </svg>
        <span>{Math.round(safeValue)}<small>%</small></span>
      </div>
      <div className="confidence-caption">
        <strong>Уверенность модели</strong>
        <span>Насколько запрос похож на описание позиции в справочнике.</span>
        <small>Это не вероятность юридической применимости нормы.</small>
      </div>
    </div>
  )
}

function LegalLink({ appendix, position, onNavigate, children, className = '' }: {
  appendix: number
  position: number
  onNavigate: LegalNavigation
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={`legal-inline-link ${className}`}
      onClick={() => onNavigate(appendix, position)}
      title={`Открыть приложение № ${appendix}, позицию ${position} в разделе ПП 1875`}
    >
      {children}
    </button>
  )
}

function Alternatives({ result, onNavigateToLegal }: { result: ClassificationResult; onNavigateToLegal: LegalNavigation }) {
  return (
    <div className="alternatives">
      <p className="alternatives__explanation">{result.explanation}</p>
      {result.alternatives.slice(1).map((item) => (
        <div className="alternative" key={item.id}>
          <div>
            <LegalLink appendix={item.appendix} position={item.position} onNavigate={onNavigateToLegal}>
              {item.name}
            </LegalLink>
            <span>{item.legal_reference}</span>
          </div>
          <code>{item.okpd2}</code>
          <span className="alternative__score">
            <strong>{Math.round(item.confidence)}%</strong>
            <small>Уверенность модели</small>
          </span>
        </div>
      ))}
    </div>
  )
}

export function SingleResult({ result, onNavigateToLegal }: {
  result: ClassificationResult
  onNavigateToLegal: LegalNavigation
}) {
  const [open, setOpen] = useState(false)
  const match = result.match

  return (
    <section className="single-result" aria-live="polite">
      <div className="result-heading">
        <div className="result-heading__main">
          <span className="section-label">Результат классификации</span>
          <h2>
            <LegalLink appendix={match.appendix} position={match.position} onNavigate={onNavigateToLegal} className="legal-inline-link--title">
              {match.name}
            </LegalLink>
          </h2>
          <p className="result-heading__query">Запрос: <strong>{result.query}</strong></p>
        </div>
        <Confidence value={match.confidence} large />
      </div>

      <div className="result-facts">
        <div className="result-fact">
          <span>Код ОКПД2</span>
          <strong className="mono">{match.okpd2}</strong>
        </div>
        <div className="result-fact">
          <span>Национальный режим</span>
          <LegalLink appendix={match.appendix} position={match.position} onNavigate={onNavigateToLegal}>
            {regimeShort(match.regime)}
          </LegalLink>
        </div>
        <div className="result-fact">
          <span>Позиция в постановлении</span>
          <LegalLink appendix={match.appendix} position={match.position} onNavigate={onNavigateToLegal}>
            Приложение № {match.appendix}, позиция {match.position}
          </LegalLink>
        </div>
        {match.quota_percent !== null && (
          <div className="result-fact result-fact--quota">
            <span>Минимальная доля закупок</span>
            <strong>{match.quota_percent}%</strong>
            <small>Доля закупок российских товаров по 223-ФЗ, установленная для этой позиции.</small>
          </div>
        )}
      </div>

      {result.needs_review && (
        <p className="review-note"><AlertTriangle size={18} />Низкая оценка сходства: проверьте формулировку и альтернативные позиции вручную.</p>
      )}

      <div className="result-actions">
        <button type="button" onClick={() => onNavigateToLegal(match.appendix, match.position)}>
          <FileText size={17} /> Открыть позицию в ПП 1875
        </button>
        <a href={match.source_url} target="_blank" rel="noreferrer">
          Открыть внешний источник <ArrowUpRight size={17} />
        </a>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          Альтернативы и метод <ChevronDown className={open ? 'rotated' : ''} size={17} />
        </button>
      </div>

      {open && <Alternatives result={result} onNavigateToLegal={onNavigateToLegal} />}
    </section>
  )
}

export function BatchResults({ results, onNavigateToLegal }: {
  results: ClassificationResult[]
  onNavigateToLegal: LegalNavigation
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="batch-results">
      <div className="batch-results__legend">
        <strong>Уверенность модели (%)</strong>
        <span>Оценка семантического сходства названия товара с записью справочника. Не является вероятностью юридической применимости нормы.</span>
      </div>
      <div className="batch-row batch-row--header" aria-hidden="true">
        <span>Запрос</span><span>Код / режим</span><span>Уверенность модели</span><span />
      </div>
      {results.map((result, index) => {
        const key = `${result.query}-${index}`
        const isOpen = expanded === key
        const match = result.match

        return (
          <div className={`batch-item ${isOpen ? 'batch-item--open' : ''}`} key={key}>
            <div className="batch-row">
              <button className="batch-query batch-query--toggle" type="button" onClick={() => setExpanded(isOpen ? null : key)} aria-expanded={isOpen} aria-controls={`batch-detail-${index}`}>
                <small>{String(index + 1).padStart(2, '0')}</small><strong>{result.query}</strong>
              </button>
              <span className="batch-code">
                <code>{match.okpd2}</code>
                <LegalLink appendix={match.appendix} position={match.position} onNavigate={onNavigateToLegal}>
                  {regimeShort(match.regime)}
                </LegalLink>
              </span>
              <span className="batch-confidence">
                {result.needs_review && <AlertTriangle size={15} />}
                <strong>{Math.round(match.confidence)}%</strong>
                <small>сходство</small>
              </span>
              <button className="batch-expand" type="button" onClick={() => setExpanded(isOpen ? null : key)} aria-label={isOpen ? 'Свернуть подробности' : 'Показать подробности'} aria-expanded={isOpen} aria-controls={`batch-detail-${index}`}>
                <ChevronDown className={isOpen ? 'rotated' : ''} size={18} />
              </button>
            </div>
            {isOpen && (
              <div className="batch-detail" id={`batch-detail-${index}`}>
                <FileCheck2 size={20} />
                <div>
                  <LegalLink appendix={match.appendix} position={match.position} onNavigate={onNavigateToLegal}>
                    {match.name}
                  </LegalLink>
                  <span>{match.legal_reference}</span>
                  <div className="batch-detail__links">
                    <button type="button" onClick={() => onNavigateToLegal(match.appendix, match.position)}>
                      {regimeShort(match.regime)} · Приложение № {match.appendix}, позиция {match.position}
                    </button>
                    {match.quota_percent !== null && <strong>Минимальная доля закупок: {match.quota_percent}%</strong>}
                  </div>
                  <small>Процент показывает оценку сходства ИИ с записью справочника, а не юридическую вероятность.</small>
                </div>
                <a href={match.source_url} target="_blank" rel="noreferrer" aria-label="Открыть внешний источник НПА"><ArrowUpRight size={18} /></a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
