import { useState, useCallback } from 'react'
import { X, Check, MessageSquare, Mic } from 'lucide-react'
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
        className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4 border animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border">
          <div>
            <h2 className="text-sm font-semibold text-txt">{t('plan.title', lang)}</h2>
            <p className="text-[11px] text-txt-muted mt-0.5 font-mono">#{task.id} — {task.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-light text-txt-muted hover:text-txt transition-all duration-150">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {task.plan ? (
            <div
              className="max-w-none text-[13px] text-txt-secondary leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(task.plan) }}
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-txt-muted text-sm">
              <div className="animate-spin mr-2 w-4 h-4 border-2 border-surface-lighter border-t-accent rounded-full" />
              {t('plan.generating', lang)}
            </div>
          )}

          {/* Questions */}
          {questions.length > 0 && (
            <div className="bg-accent/5 rounded-lg p-4 space-y-3 border border-accent/10">
              <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">
                {t('plan.questions_title', lang)}
              </h3>
              {questions.map(q => (
                <div key={q.key} className="space-y-1.5">
                  <p className="text-[13px] font-medium text-txt-secondary">{q.question}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map(opt => (
                      <button
                        key={opt}
                        onClick={() => selectAnswer(q.key, opt)}
                        className={`rounded-md px-3 py-1.5 text-xs font-mono transition-all duration-150 ${
                          answers[q.key] === opt
                            ? 'bg-accent text-white shadow-sm'
                            : 'bg-surface-light text-txt-secondary border hover:bg-surface-lighter'
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
                rows={3}
                className="w-full rounded-lg border bg-surface-deep p-3 pr-10 text-sm text-txt outline-none focus:border-accent/40 focus:ring-2 focus:ring-accent/10 font-mono transition-all duration-150"
              />
              <button
                type="button"
                onClick={startFeedbackVoice}
                className={`absolute right-2 top-2 p-1 rounded-md transition-all duration-150 ${feedbackListening ? 'bg-red-500/10 text-red-400' : 'hover:bg-surface-light text-txt-muted'}`}
              >
                <Mic size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-txt-secondary hover:bg-surface-light transition-all duration-150"
          >
            {t('plan.close', lang)}
          </button>
          {feedbackMode ? (
            <button
              onClick={() => { onReject(feedback); setFeedbackMode(false) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-all duration-150"
            >
              <MessageSquare size={13} />
              {t('plan.feedback', lang)}
            </button>
          ) : (
            <button
              onClick={() => setFeedbackMode(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/20 transition-all duration-150"
            >
              <MessageSquare size={13} />
              {t('plan.feedback', lang)}
            </button>
          )}
          <button
            onClick={() => onApprove(answers)}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm transition-all duration-150"
          >
            <Check size={13} />
            {t('plan.approve', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
