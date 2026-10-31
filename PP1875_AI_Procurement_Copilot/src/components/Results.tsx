import { useState } from 'react'
import { AlertTriangle, ArrowUpRight, ChevronDown, FileCheck2 } from 'lucide-react'
import type { ClassificationResult } from '@/types/api'
import { regimeShort } from '@/lib/format'

export function Confidence({ value, large = false }: { value: number; large?: boolean }) {
  const radius = 18
  const circumference = 2 * Math.PI * radius
  return (
    <div className={`confidence ${large ? 'confidence--large' : ''}`} aria-label={`Уверенность ${value}%`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="confidence__track" cx="22" cy="22" r={radius} />
        <circle className="confidence__value" cx="22" cy="22" r={radius}
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
      </svg>
      <span>{Math.round(value)}<small>%</small></span>
    </div>
  )
}

function Alternatives({ result }: { result: ClassificationResult }) {
  return (
    <div className="alternatives">
      <p className="alternatives__explanation">{result.explanation}</p>
      {result.alternatives.slice(1).map((item) => (
        <div className="alternative" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <span>{item.legal_reference}</span>
          </div>
          <code>{item.okpd2}</code>
          <span className="alternative__score">{item.confidence}%</span>
        </div>
      ))}
    </div>
  )
}

export function SingleResult({ result }: { result: ClassificationResult }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="single-result" aria-live="polite">
      <div className="result-heading">
        <div>
          <span className="section-label">Результат классификации</span>
          <h2>{result.match.name}</h2>
        </div>
        <Confidence value={result.match.confidence} large />
      </div>
      <div className="result-facts">
        <div><span>Код ОКПД2</span><strong className="mono">{result.match.okpd2}</strong></div>
        <div><span>Национальный режим</span><strong>{regimeShort(result.match.regime)}</strong></div>
        <div><span>Позиция</span><strong>Приложение № {result.match.appendix}, поз. {result.match.position}</strong></div>
        {result.match.quota_percent !== null && <div><span>Минимальная доля</span><strong>{result.match.quota_percent}%</strong></div>}
      </div>
      {result.needs_review && <p className="review-note"><AlertTriangle size={18} />Низкая близость: проверьте формулировку и альтернативные позиции.</p>}
      <div className="result-actions">
        <a href={result.match.source_url} target="_blank" rel="noreferrer">Открыть источник НПА <ArrowUpRight size={17} /></a>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
          Альтернативы и метод <ChevronDown className={open ? 'rotated' : ''} size={17} />
        </button>
      </div>
      {open && <Alternatives result={result} />}
    </section>
  )
}

export function BatchResults({ results }: { results: ClassificationResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="batch-results">
      <div className="batch-row batch-row--header" aria-hidden="true">
        <span>Запрос</span><span>Код / режим</span><span>Уверенность</span><span />
      </div>
      {results.map((result, index) => {
        const key = `${result.query}-${index}`
        const isOpen = expanded === key
        return (
          <div className={`batch-item ${isOpen ? 'batch-item--open' : ''}`} key={key}>
            <button className="batch-row" type="button" onClick={() => setExpanded(isOpen ? null : key)} aria-expanded={isOpen}>
              <span className="batch-query"><small>{String(index + 1).padStart(2, '0')}</small><strong>{result.query}</strong></span>
              <span className="batch-code"><code>{result.match.okpd2}</code><small>{regimeShort(result.match.regime)}</small></span>
              <span className="batch-confidence">{result.needs_review && <AlertTriangle size={15} />}{result.match.confidence}%</span>
              <ChevronDown className={isOpen ? 'rotated' : ''} size={18} />
            </button>
            {isOpen && <div className="batch-detail">
              <FileCheck2 size={20} />
              <div><strong>{result.match.name}</strong><span>{result.match.legal_reference}</span></div>
              <a href={result.match.source_url} target="_blank" rel="noreferrer" aria-label="Открыть источник НПА"><ArrowUpRight size={18} /></a>
            </div>}
          </div>
        )
      })}
    </div>
  )
}
