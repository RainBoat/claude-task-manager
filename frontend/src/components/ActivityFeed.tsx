import { useEffect, useRef } from 'react'
import type { FeedEntry } from '../hooks/useWorkerLogs'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  entries: FeedEntry[]
  selectedWorkerId: string | null
  lang: Lang
}

function formatEntry(entry: FeedEntry): string {
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
  const prefix = `[W${entry.workerIndex}] ${ts}`
  if (entry.type === 'assistant' && entry.message) return `${prefix} [assistant] ${entry.message}`
  if (entry.type === 'tool_use') return `${prefix} [tool] ${entry.tool ?? ''}: ${entry.message ?? ''}`
  if (entry.type === 'tool_result') return `${prefix} [result] ${(entry.message ?? '').slice(0, 200)}`
  if (entry.type === 'error') return `${prefix} [ERROR] ${entry.error ?? entry.message ?? ''}`
  return `${prefix} [${entry.type}] ${entry.message ?? ''}`
}

const typeColor: Record<string, string> = {
  error: 'text-red-400',
  tool_use: 'text-cyan-400',
  tool_result: 'text-gray-500',
  assistant: 'text-gray-300',
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
    <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-0.5 min-h-0">
      {filtered.length === 0 && (
        <p className="text-gray-500 dark:text-gray-500 text-center py-4">
          {t('workers.no_activity', lang)}
        </p>
      )}
      {filtered.map((entry, i) => (
        <div key={i} className={`leading-relaxed ${typeColor[entry.type] ?? 'text-gray-400'}`}>
          {formatEntry(entry)}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
