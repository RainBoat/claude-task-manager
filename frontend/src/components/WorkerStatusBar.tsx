import { useState, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
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
    <div className="flex-shrink-0 border-t border bg-surface flex flex-col transition-all duration-200"
      style={{ height: expanded ? 240 : 40 }}
    >
      {/* Chip bar */}
      <div className="flex items-center h-10 px-3 gap-1.5 flex-shrink-0 overflow-x-auto">
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-1 rounded-md text-txt-muted hover:text-txt-secondary hover:bg-surface-light flex-shrink-0 transition-all duration-150"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className="w-px h-4 bg-surface-lighter flex-shrink-0" />
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
        <div className="flex-1 border-t border min-h-0 flex flex-col bg-surface-deep">
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
