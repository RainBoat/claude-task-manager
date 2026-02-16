import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react'
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

const MIN_HEIGHT = 120
const MAX_HEIGHT_VH = 0.8
const DEFAULT_HEIGHT = 340
const COLLAPSED_HEIGHT = 40

export default function WorkerStatusBar({ workers, lang, onViewFullLog }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const entries = useWorkerLogs(workers)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const handleChipClick = useCallback((id: string) => {
    setSelectedWorkerId(prev => prev === id ? null : id)
  }, [])

  const handleChipDoubleClick = useCallback((id: string) => {
    onViewFullLog(id)
  }, [onViewFullLog])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [height])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const maxH = window.innerHeight * MAX_HEIGHT_VH
      const delta = startY.current - e.clientY
      setHeight(Math.min(maxH, Math.max(MIN_HEIGHT, startH.current + delta)))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (workers.length === 0) return null

  return (
    <div className="flex-shrink-0 border-t border bg-surface flex flex-col transition-[height] duration-200"
      style={{ height: expanded ? height : COLLAPSED_HEIGHT }}
    >
      {/* Drag handle */}
      {expanded && (
        <div
          onMouseDown={onDragStart}
          className="flex items-center justify-center h-2 cursor-row-resize hover:bg-surface-lighter/50 flex-shrink-0 group"
        >
          <GripHorizontal size={12} className="text-txt-muted/40 group-hover:text-txt-muted transition-colors" />
        </div>
      )}

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
