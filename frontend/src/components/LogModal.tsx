import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Wifi, WifiOff } from 'lucide-react'
import { createLogSocket } from '../api'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import type { FeedEntry } from '../hooks/useWorkerLogs'
import LogEntryRow from './LogEntryRow'

interface Props {
  workerId: string
  projectId?: string
  lang: Lang
  onClose: () => void
}

function hasContent(entry: FeedEntry): boolean {
  if (entry.type === 'assistant') return !!entry.text?.trim()
  if (entry.type === 'tool_use') return !!entry.tool
  if (entry.type === 'error') return !!(entry.error || entry.text)
  if (entry.type === 'result') return true
  if (entry.type === 'system') return !!entry.text?.trim()
  return !!(entry.text || entry.message)
}

export default function LogModal({ workerId, projectId, lang, onClose }: Props) {
  const [entries, setEntries] = useState<FeedEntry[]>([])
  const [connected, setConnected] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const isNearBottom = useRef(true)

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }, [])

  useEffect(() => {
    const ws = createLogSocket(workerId, {
      projectId,
      history: projectId ? 0 : 50,
    })
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        const entry: FeedEntry = {
          workerId,
          workerIndex: 0,
          type: data.type,
          timestamp: data.timestamp,
          message: data.message ?? data.text,
          text: data.text,
          tool: data.tool,
          input: data.input,
          inputRaw: data.input_raw,
          error: data.error,
          cost: data.cost,
          duration: data.duration,
          turns: data.turns,
        }
        if (!hasContent(entry)) return
        setEntries(prev => [...prev, entry])
      } catch { /* ignore */ }
    }

    return () => { ws.close() }
  }, [workerId, projectId])

  useEffect(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-txt font-mono">{t('log.title', lang)} — {workerId}</h2>
            {connected ? (
              <Wifi size={13} className="text-emerald-400" />
            ) : (
              <WifiOff size={13} className="text-red-400" />
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-light text-txt-muted hover:text-txt transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        {/* Log content */}
        <div
          ref={containerRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto p-4 log-terminal font-mono text-[11px] space-y-px"
        >
          {entries.length === 0 && (
            <p className="text-txt-muted text-center py-8 text-xs">Waiting for log entries...</p>
          )}
          {entries.map((entry, i) => (
            <LogEntryRow key={i} entry={entry} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-lg border text-txt-secondary text-xs hover:bg-surface-light transition-all duration-150"
          >
            {t('log.close', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
