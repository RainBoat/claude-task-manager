import { useState } from 'react'
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

/** Simple markdown-ish rendering for plan preview */
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
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">
              {lang === 'zh' ? '批量审批 Plans' : 'Batch Review Plans'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {tasks.length} {lang === 'zh' ? '个待审批' : 'pending review'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 text-xl">
            ✕
          </button>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-6 py-3 space-y-3">
          {tasks.map(task => (
            <div
              key={task.id}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    <span className="text-gray-400 mr-1">#{task.id}</span>
                    {task.title}
                  </p>
                  {task.plan && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {previewPlan(task.plan)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onOpenDetail(task)}
                    className="px-2.5 py-1.5 rounded-lg text-xs border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    {lang === 'zh' ? '详情' : 'Detail'}
                  </button>
                  <button
                    onClick={() => setRejectingId(rejectingId === task.id ? null : task.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
                  >
                    {lang === 'zh' ? '反馈' : 'Reject'}
                  </button>
                  <button
                    onClick={() => onApprove(task.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-green-500 hover:bg-green-600 text-white transition-colors"
                  >
                    {lang === 'zh' ? '批准' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Inline reject feedback */}
              {rejectingId === task.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder={lang === 'zh' ? '输入反馈...' : 'Enter feedback...'}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-sm outline-none focus:ring-1 focus:ring-purple-400"
                    onKeyDown={e => e.key === 'Enter' && handleReject(task.id)}
                    autoFocus
                  />
                  <button
                    onClick={() => handleReject(task.id)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-purple-500 text-white hover:bg-purple-600 transition-colors"
                  >
                    {lang === 'zh' ? '发送' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('plan.close', lang)}
          </button>
          <button
            onClick={onApproveAll}
            className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium shadow-sm transition-colors"
          >
            {lang === 'zh' ? `全部批准 (${tasks.length})` : `Approve All (${tasks.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
