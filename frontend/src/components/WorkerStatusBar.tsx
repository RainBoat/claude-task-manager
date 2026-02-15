import { useState, useCallback } from 'react'
import type { Worker } from '../types'
import type { Lang } from '../i18n'
import { useWorkerLogs } from '../hooks/useWorkerLogs'
import WorkerChip from './WorkerChip'
import ActivityFeed from './ActivityFeed'

interface Props {
  workers: Worker[]
  lang: Lang
  onViewFullLog: (workerId: string) => void
}

export default function WorkerStatusBar({ workers, lang, onViewFullLog }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const entries = useWorkerLogs(workers)

  const handleChipClick = useCallback((id: string) => {
    setSelectedWorkerId(prev => prev === id ? null : id)
  }, [])

  const handleChipDoubleClick = useCallback((id: string) => {
    onViewFullLog(id)
  }, [onViewFullLog])

  if (workers.length === 0) return null

  return (
    <div
      className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col"
      style={{ height: expanded ? 220 : 36 }}
    >
      {/* Chip bar */}
      <div className="flex items-center h-9 px-2 gap-1 flex-shrink-0 overflow-x-auto">
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs flex-shrink-0"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▼' : '▲'}
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 flex-shrink-0" />
        {workers.map((w, i) => (
          <WorkerChip
            key={w.id}
            worker={w}
            index={i + 1}
            selected={selectedWorkerId === w.id}
            lang={lang}
            onClick={() => handleChipClick(w.id)}
            onDoubleClick={() => handleChipDoubleClick(w.id)}
          />
        ))}
      </div>

      {/* Expanded activity feed */}
      {expanded && (
        <div className="flex-1 border-t border-gray-200 dark:border-gray-700 min-h-0 flex flex-col">
          <ActivityFeed
            entries={entries}
            selectedWorkerId={selectedWorkerId}
            lang={lang}
          />
        </div>
      )}
    </div>
  )
}
