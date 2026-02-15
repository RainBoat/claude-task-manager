import { useState, useCallback } from 'react'
import type { Task } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  task: Task
  lang: Lang
  onApprove: (answers: Record<string, string>) => void
  onReject: (feedback: string) => void
  onClose: () => void
}

/** Simple markdown-ish rendering: headings, bold, code blocks, lists */
function renderMarkdown(text: string): string {
  return text
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-sm">$1</code>')
    .replace(/^```(\w*)\n([\s\S]*?)^```/gm, '<pre class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 my-2 overflow-x-auto text-sm"><code>$2</code></pre>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$1</li>')
    .replace(/\n{2,}/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

export default function PlanModal({ task, lang, onApprove, onReject, onClose }: Props) {
  const questions = task.plan_questions ?? []
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    questions.forEach(q => { init[q.key] = q.default ?? q.options[0] ?? '' })
    return init
  })
  const [feedbackMode, setFeedbackMode] = useState(false)
  const [feedback, setFeedback] = useState('')

  const handleFeedbackVoice = useCallback((text: string) => {
    setFeedback(prev => prev ? prev + ' ' + text : text)
  }, [])
  const { listening: feedbackListening, startListening: startFeedbackVoice } = useVoiceInput(handleFeedbackVoice)

  const selectAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">{t('plan.title', lang)}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">#{task.id} — {task.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 text-xl">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Plan text */}
          {task.plan ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(task.plan) }}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <div className="animate-spin mr-2 w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full" />
              {t('plan.generating', lang)}
            </div>
          )}

          {/* Questions */}
          {questions.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                {t('plan.questions_title', lang)}
              </h3>
              {questions.map(q => (
                <div key={q.key} className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{q.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => selectAnswer(q.key, opt)}
                        className={`rounded-full px-4 py-2 text-sm transition-colors ${
                          answers[q.key] === opt
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Feedback textarea */}
          {feedbackMode && (
            <div className="relative">
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Enter your feedback..."
                rows={4}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3 pr-10 text-sm outline-none focus:ring-2 focus:ring-purple-400"
              />
              <button
                type="button"
                onClick={startFeedbackVoice}
                className={`absolute right-2 top-2 p-1.5 rounded-lg transition-colors ${feedbackListening ? 'bg-red-100 dark:bg-red-900 text-red-500' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400'}`}
                title="Voice input"
              >
                🎤
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('plan.close', lang)}
          </button>
          {feedbackMode ? (
            <button
              onClick={() => { onReject(feedback); setFeedbackMode(false) }}
              className="px-5 py-2.5 rounded-xl bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
            >
              {t('plan.feedback', lang)}
            </button>
          ) : (
            <button
              onClick={() => setFeedbackMode(true)}
              className="px-5 py-2.5 rounded-xl bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
            >
              {t('plan.feedback', lang)}
            </button>
          )}
          <button
            onClick={() => onApprove(answers)}
            className="px-5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium shadow-sm transition-colors"
          >
            {t('plan.approve', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
