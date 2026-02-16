import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react'
import type { Worker, DispatcherEvent } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useWorkerLogs } from '../hooks/useWorkerLogs'
import { fetchDispatcherEvents } from '../api'
import WorkerChip from './WorkerChip'
import ActivityFeed from './ActivityFeed'

interface Props {
  workers: Worker[]
  lang: Lang
  activeProjectId: string | null
  onViewFullLog: (workerId: string) => void
  onStopTask: (taskId: string) => void
}

const MIN_HEIGHT = 120
const MAX_HEIGHT_VH = 0.8
const DEFAULT_HEIGHT = 340
const COLLAPSED_HEIGHT = 40

type Tab = 'activity' | 'system'

const sourceColor: Record<string, string> = {
  system: 'text-purple-400',
  dispatcher: 'text-txt-muted',
}

function getSourceColor(source: string): string {
  if (source.startsWith('worker')) return 'text-blue-400'
  return sourceColor[source] ?? 'text-txt-muted'
}

function SystemEventFeed({ events, lang }: { events: DispatcherEvent[]; lang: Lang }) {
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
  }, [events])

  return (
    <div
      ref={containerRef}
      onScroll={checkNearBottom}
      className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] min-h-0"
    >
      {events.length === 0 && (
        <p className="text-txt-muted text-center py-4 text-xs">
          {t('workers.no_events', lang)}
        </p>
      )}
      {events.map((ev, i) => {
        const ts = new Date(ev.ts + 'Z').toLocaleTimeString()
        const color = getSourceColor(ev.source)
        return (
          <div key={i} className="group py-0.5">
            <div className="flex gap-2 items-start">
              <span className="text-txt-muted flex-shrink-0 text-[10px] w-[52px] text-right pt-px">{ts}</span>
              <span className={`flex-shrink-0 text-[10px] font-medium ${color}`}>[{ev.source}]</span>
              <span className="text-txt-secondary min-w-0 truncate">{ev.message}</span>
            </div>
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

export default function WorkerStatusBar({ workers, lang, activeProjectId, onViewFullLog, onStopTask }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('activity')
  const [dispatcherEvents, setDispatcherEvents] = useState<DispatcherEvent[]>([])
  const entries = useWorkerLogs(workers)
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  // Poll dispatcher events when expanded and on system tab
  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    const poll = async () => {
      try {
        const events = await fetchDispatcherEvents(100)
        if (!cancelled) setDispatcherEvents(events)
      } catch { /* ignore */ }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [expanded])

  const handleChipClick = useCallback((id: string) => {
    setSelectedWorkerId(prev => prev === id ? null : id)
    setActiveTab('activity')
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
            onStop={activeProjectId && w.current_task_id ? () => onStopTask(w.current_task_id!) : undefined}
          />
        ))}
        {/* Tab switcher (only when expanded) */}
        {expanded && (
          <>
            <div className="w-px h-4 bg-surface-lighter flex-shrink-0 ml-auto" />
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 transition-colors ${
                activeTab === 'activity'
                  ? 'bg-surface-lighter text-txt-secondary'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              {t('workers.activity', lang)}
            </button>
            <button
              onClick={() => { setActiveTab('system'); setSelectedWorkerId(null) }}
              className={`px-2 py-0.5 rounded text-[11px] font-medium flex-shrink-0 transition-colors ${
                activeTab === 'system'
                  ? 'bg-surface-lighter text-txt-secondary'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              {t('workers.system_log', lang)}
            </button>
          </>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="flex-1 border-t border min-h-0 flex flex-col bg-surface-deep">
          {activeTab === 'activity' ? (
            <ActivityFeed
              entries={entries}
              selectedWorkerId={selectedWorkerId}
              lang={lang}
            />
          ) : (
            <SystemEventFeed events={dispatcherEvents} lang={lang} />
          )}
        </div>
      )}
    </div>
  )
}
