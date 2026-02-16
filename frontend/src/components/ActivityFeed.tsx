import { useEffect, useRef } from 'react'
import type { FeedEntry } from '../hooks/useWorkerLogs'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  entries: FeedEntry[]
  selectedWorkerId: string | null
  lang: Lang
}

function formatEntry(entry: FeedEntry): { prefix: string; body: string } {
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
  const prefix = `W${entry.workerIndex} ${ts}`
  if (entry.type === 'assistant' && entry.message) return { prefix, body: entry.message }
  if (entry.type === 'tool_use') return { prefix, body: `→ ${entry.tool ?? ''} ${entry.message ?? ''}` }
  if (entry.type === 'tool_result') return { prefix, body: `← ${(entry.message ?? '').slice(0, 200)}` }
  if (entry.type === 'error') return { prefix, body: `✗ ${entry.error ?? entry.message ?? ''}` }
  return { prefix, body: entry.message ?? '' }
}

const typeColor: Record<string, string> = {
  error: 'text-red-500 dark:text-red-400',
  tool_use: 'text-accent',
  tool_result: 'text-txt-muted',
  assistant: 'text-txt-secondary',
}

export default function ActivityFeed({ entries, selectedWorkerId, lang }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const filtered = selectedWorkerId
    ? entries.filter(e => e.workerId === selectedWorkerId)
    : entries

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] space-y-px min-h-0">
      {filtered.length === 0 && (
        <p className="text-txt-muted text-center py-4 text-xs">
          {t('workers.no_activity', lang)}
        </p>
      )}
      {filtered.map((entry, i) => {
        const { prefix, body } = formatEntry(entry)
        return (
          <div key={i} className={`leading-relaxed flex gap-2 py-px ${typeColor[entry.type] ?? 'text-txt-muted'}`}>
            <span className="text-txt-muted flex-shrink-0 w-[90px] text-right">{prefix}</span>
            <span className="truncate" title={body}>{body}</span>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
