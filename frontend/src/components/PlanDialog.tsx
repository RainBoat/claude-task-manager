import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Check, Send, Wifi, WifiOff, Loader2 } from 'lucide-react'
import { createPlanSocket, planChat } from '../api'
import type { Task, PlanMessage } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  task: Task
  projectId: string
  lang: Lang
  onApprove: (answers: Record<string, string>) => void
  onClose: () => void
}

function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold mt-3 mb-1 text-txt">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-semibold mt-4 mb-1.5 text-txt">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-lg font-bold mt-5 mb-2 text-txt">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-txt">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-surface-light rounded text-[12px] text-accent font-mono">$1</code>')
    .replace(/^```(\w*)\n([\s\S]*?)^```/gm, '<pre class="bg-surface-light rounded-lg p-3 my-2 overflow-x-auto text-[12px] border font-mono"><code>$2</code></pre>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-[13px] text-txt-secondary leading-relaxed">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-[13px] text-txt-secondary leading-relaxed">$1</li>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

export default function PlanDialog({ task, projectId, lang, onApprove, onClose }: Props) {
  const [messages, setMessages] = useState<PlanMessage[]>(task.plan_messages ?? [])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const isNearBottom = useRef(true)

  // If task has no plan yet, it's still generating the initial plan
  const initialGenerating = !task.plan && messages.length === 0

  const scrollToBottom = useCallback(() => {
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const checkNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  // WebSocket connection for streaming
  useEffect(() => {
    const ws = createPlanSocket(projectId, task.id)
    wsRef.current = ws

    let currentStreamParts: string[] = []

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)

        if (data.type === 'assistant' && data.text) {
          // Streaming text from Claude
          setStreaming(true)
          currentStreamParts.push(data.text)
          setStreamText(currentStreamParts.join(''))
        } else if (data.type === 'result') {
          // Turn complete
          if (currentStreamParts.length > 0) {
            const fullText = currentStreamParts.join('')
            currentStreamParts = []
            setStreamText('')
            setStreaming(false)
            setSending(false)

            // Only add if we don't already have this message
            // (initial messages come from task.plan_messages)
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1]
              if (lastMsg?.role === 'assistant' && lastMsg.content === fullText) {
                return prev
              }
              return [...prev, {
                role: 'assistant',
                content: fullText,
                timestamp: new Date().toISOString(),
              }]
            })
          } else {
            setStreaming(false)
            setSending(false)
          }
        } else if (data.type === 'tool_use') {
          // Show tool usage as part of streaming
          setStreaming(true)
        }
      } catch { /* ignore parse errors */ }
    }

    return () => { ws.close() }
  }, [projectId, task.id])

  // Auto-scroll on new content
  useEffect(() => {
    scrollToBottom()
  }, [messages, streamText, scrollToBottom])

  const handleSend = useCallback(async () => {
    const msg = input.trim()
    if (!msg || sending || streaming) return

    setInput('')
    setSending(true)

    // Add user message to local state immediately
    const userMsg: PlanMessage = {
      role: 'user',
      content: msg,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      await planChat(projectId, task.id, msg)
    } catch {
      setSending(false)
    }
  }, [input, sending, streaming, projectId, task.id])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const inputDisabled = sending || streaming || initialGenerating

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border">
          <div className="flex items-center gap-2">
            <div>
              <h2 className="text-sm font-semibold text-txt">{t('plan.dialog_title', lang)}</h2>
              <p className="text-[11px] text-txt-muted mt-0.5 font-mono">#{task.id} — {task.title}</p>
            </div>
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

        {/* Messages */}
        <div
          ref={containerRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
        >
          {initialGenerating && (
            <div className="flex items-center justify-center py-12 text-txt-muted text-sm">
              <Loader2 size={16} className="animate-spin mr-2" />
              {t('plan.generating', lang)}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-accent/10 border border-accent/20'
                  : 'bg-surface-light border'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${
                    msg.role === 'user' ? 'text-accent' : 'text-emerald-400'
                  }`}>
                    {msg.role === 'user' ? 'You' : 'Claude'}
                  </span>
                </div>
                {msg.role === 'assistant' ? (
                  <div
                    className="max-w-none text-[13px] text-txt-secondary leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                ) : (
                  <p className="text-[13px] text-txt-secondary leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Streaming assistant message */}
          {(streaming || sending) && streamText && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg px-4 py-3 bg-surface-light border">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-400">Claude</span>
                  <Loader2 size={10} className="animate-spin text-emerald-400" />
                </div>
                <div
                  className="max-w-none text-[13px] text-txt-secondary leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(streamText) }}
                />
              </div>
            </div>
          )}

          {/* Thinking indicator (no text yet) */}
          {(sending || streaming) && !streamText && (
            <div className="flex justify-start">
              <div className="rounded-lg px-4 py-3 bg-surface-light border">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-emerald-400" />
                  <span className="text-xs text-txt-muted">{t('plan.thinking', lang)}</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="px-5 py-3 border-t border">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('plan.chat_placeholder', lang)}
              rows={2}
              disabled={inputDisabled}
              className="flex-1 rounded-lg border bg-surface-deep p-3 text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150 resize-none disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={inputDisabled || !input.trim()}
              className="p-2.5 rounded-lg bg-accent hover:bg-accent/80 text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-[10px] text-txt-muted mt-1 font-mono">Ctrl/Cmd+Enter to send</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-light transition-all duration-150"
          >
            {t('plan.close', lang)}
          </button>
          <button
            onClick={() => onApprove({})}
            disabled={initialGenerating || streaming || sending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={13} />
            {t('plan.approve', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
