import { useEffect, useRef, useState } from 'react'
import { createLogSocket } from '../api'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  workerId: string
  lang: Lang
  onClose: () => void
}

interface LogEntry {
  type: string
  timestamp?: string
  message?: string
  tool?: string
  error?: string
  [key: string]: any
}

export default function LogModal({ workerId, lang, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = createLogSocket(workerId)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        setEntries(prev => [...prev, data])
      } catch { /* ignore */ }
    }

    return () => { ws.close() }
  }, [workerId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries])

  const formatEntry = (entry: LogEntry): string => {
    const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
    if (entry.type === 'assistant' && entry.message) return `${ts} [assistant] ${entry.message}`
    if (entry.type === 'tool_use') return `${ts} [tool] ${entry.tool ?? ''}: ${entry.message ?? ''}`
    if (entry.type === 'tool_result') return `${ts} [result] ${(entry.message ?? '').slice(0, 200)}`
    if (entry.type === 'error') return `${ts} [ERROR] ${entry.error ?? entry.message ?? ''}`
    return `${ts} [${entry.type}] ${entry.message ?? JSON.stringify(entry).slice(0, 200)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-200">{t('log.title', lang)} — {workerId}</h2>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 text-lg">✕</button>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-y-auto p-4 log-terminal text-xs text-gray-300 space-y-0.5">
          {entries.length === 0 && (
            <p className="text-gray-500 text-center py-8">Waiting for log entries...</p>
          )}
          {entries.map((entry, i) => (
            <div key={i} className={`leading-relaxed ${entry.type === 'error' ? 'text-red-400' : ''}`}>
              {formatEntry(entry)}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-xs hover:bg-gray-800 transition-colors"
          >
            {t('log.close', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
