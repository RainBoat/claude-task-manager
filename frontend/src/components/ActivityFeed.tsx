import { useEffect, useRef, useCallback } from 'react'
import type { FeedEntry } from '../hooks/useWorkerLogs'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import LogEntryRow from './LogEntryRow'

interface Props {
  entries: FeedEntry[]
  selectedWorkerId: string | null
  lang: Lang
}

export default function ActivityFeed({ entries, selectedWorkerId, lang }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries])

  const filtered = selectedWorkerId
    ? entries.filter(e => e.workerId === selectedWorkerId)
    : entries

  // For multi-worker view, track worker transitions to show separator labels
  const showWorkerLabel = !selectedWorkerId
  let lastWorkerId: string | null = null

  return (
    <div
      ref={containerRef}
      onScroll={checkNearBottom}
      className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] min-h-0"
    >
      {filtered.length === 0 && (
        <p className="text-txt-muted text-center py-4 text-xs">
          {t('workers.no_activity', lang)}
        </p>
      )}
      {filtered.map((entry, i) => {
        const needsSeparator = showWorkerLabel && entry.workerId !== lastWorkerId && lastWorkerId !== null
        lastWorkerId = entry.workerId
        return (
          <div key={i}>
            {needsSeparator && (
              <div className="flex items-center gap-2 my-1.5">
                <div className="h-px flex-1 bg-surface-lighter" />
                <span className="text-[9px] text-txt-muted font-semibold px-1.5 py-px rounded bg-surface-lighter">
                  W{entry.workerIndex}
                </span>
                <div className="h-px flex-1 bg-surface-lighter" />
              </div>
            )}
            <LogEntryRow entry={entry} showWorkerLabel={showWorkerLabel && !needsSeparator && (i === 0 || filtered[i - 1]?.workerId === entry.workerId)} />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}
