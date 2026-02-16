import { useState } from 'react'
import { X, Check, CheckCheck, MessageSquare } from 'lucide-react'
import type { Task } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  tasks: Task[]
  lang: Lang
  onApprove: (taskId: string) => void
  onReject: (taskId: string, feedback: string) => void
  onApproveAll: () => void
  onOpenDetail: (task: Task) => void
  onClose: () => void
}

function previewPlan(text: string, maxLen = 200): string {
  const plain = text
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.length > maxLen ? plain.slice(0, maxLen) + '...' : plain
}

export default function BatchPlanReview({ tasks, lang, onApprove, onReject, onApproveAll, onOpenDetail, onClose }: Props) {
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState('')

  const handleReject = (taskId: string) => {
    onReject(taskId, feedback)
    setRejectingId(null)
    setFeedback('')
  }

  if (tasks.length === 0) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border">
          <div>
            <h2 className="text-sm font-semibold text-txt">
              {lang === 'zh' ? '批量审批 Plans' : 'Batch Review Plans'}
            </h2>
            <p className="text-[11px] text-txt-muted mt-0.5 font-mono">
              {tasks.length} {lang === 'zh' ? '个待审批' : 'pending review'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-light text-txt-muted hover:text-txt transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {tasks.map(task => (
            <div
              key={task.id}
              className="border rounded-lg p-3 hover:bg-surface-light/50 transition-all duration-150"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenDetail(task)}>
                  <p className="text-[13px] font-medium truncate text-txt">
                    <span className="text-txt-muted mr-1 font-mono text-[11px]">#{task.id}</span>
                    {task.title}
                  </p>
                  {task.plan && (
                    <p className="text-[11px] text-txt-muted mt-1 line-clamp-2 leading-relaxed">
                      {previewPlan(task.plan)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setRejectingId(rejectingId === task.id ? null : task.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-all duration-150"
                  >
                    <MessageSquare size={11} />
                  </button>
                  <button
                    onClick={() => onApprove(task.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-all duration-150"
                  >
                    <Check size={11} />
                    {lang === 'zh' ? '批准' : 'Approve'}
                  </button>
                </div>
              </div>

              {rejectingId === task.id && (
                <div className="mt-2 flex gap-1.5 animate-fade-in">
                  <input
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder={lang === 'zh' ? '输入反馈...' : 'Enter feedback...'}
                    className="flex-1 px-2.5 py-1.5 rounded-md border bg-surface-deep text-xs text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
                    onKeyDown={e => e.key === 'Enter' && handleReject(task.id)}
                    autoFocus
                  />
                  <button
                    onClick={() => handleReject(task.id)}
                    className="px-2.5 py-1.5 rounded-md text-[10px] font-medium bg-violet-500 text-white hover:bg-violet-600 transition-all duration-150"
                  >
                    {lang === 'zh' ? '发送' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-light transition-all duration-150"
          >
            {t('plan.close', lang)}
          </button>
          <button
            onClick={onApproveAll}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all duration-150"
          >
            <CheckCheck size={14} />
            {lang === 'zh' ? `全部批准 (${tasks.length})` : `Approve All (${tasks.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
