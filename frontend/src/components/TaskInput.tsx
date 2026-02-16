import { useState, useRef, useCallback } from 'react'
import { Send, Mic, Sparkles, Link } from 'lucide-react'
import type { Task, TaskCreatePayload } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { useVoiceInput } from '../hooks/useVoiceInput'

interface Props {
  tasks: Task[]
  lang: Lang
  onSubmit: (payload: TaskCreatePayload) => Promise<void>
}

export default function TaskInput({ tasks, lang, onSubmit }: Props) {
  const [description, setDescription] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [dependsOn, setDependsOn] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleVoiceResult = useCallback((text: string) => {
    setDescription(prev => prev ? prev + ' ' + text : text)
  }, [])
  const { listening, startListening: handleVoice } = useVoiceInput(handleVoiceResult)

  const dependableTasks = tasks.filter(t =>
    ['pending', 'claimed', 'running', 'plan_pending', 'plan_approved', 'merging', 'testing'].includes(t.status)
  )

  const handleSubmit = useCallback(async () => {
    const trimDesc = description.trim()
    if (!trimDesc) return

    setSubmitting(true)
    try {
      await onSubmit({
        description: trimDesc,
        depends_on: dependsOn,
        plan_mode: planMode,
      })
      setDescription('')
      setDependsOn(null)
    } finally {
      setSubmitting(false)
    }
  }, [description, dependsOn, planMode, onSubmit])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      <div className={`max-w-2xl mx-auto rounded-xl border bg-surface transition-all duration-200 ${
        focused ? 'border-accent/40 shadow-[0_0_0_3px_rgba(99,102,241,0.08)]' : 'border shadow-sm'
      }`}>
        {/* Input row */}
        <div className="flex items-start gap-2 px-3 py-2.5">
          <textarea
            ref={textareaRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t('input.placeholder', lang)}
            rows={1}
            className="flex-1 bg-transparent text-sm text-txt placeholder-txt-muted outline-none resize-none py-1 leading-relaxed"
          />
          <div className="flex items-center gap-0.5 flex-shrink-0 pt-0.5">
            <button
              type="button"
              onClick={handleVoice}
              className={`p-1.5 rounded-lg transition-all duration-150 ${
                listening ? 'bg-red-500/10 text-red-500' : 'hover:bg-surface-light text-txt-muted hover:text-txt-secondary'
              }`}
              title="Voice input"
            >
              <Mic size={15} />
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!description.trim() || submitting}
              className="p-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all duration-150"
            >
              <Send size={15} />
            </button>
          </div>
        </div>

        {/* Options bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-t text-[11px] text-txt-secondary">
          <button
            type="button"
            onClick={() => setPlanMode(!planMode)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md transition-all duration-150 font-medium ${
              planMode
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-surface-light text-txt-muted'
            }`}
          >
            <Sparkles size={12} />
            <span>Plan</span>
          </button>

          {dependableTasks.length > 0 && (
            <div className="inline-flex items-center gap-1">
              <Link size={12} className="text-txt-muted" />
              <select
                value={dependsOn ?? ''}
                onChange={e => setDependsOn(e.target.value || null)}
                className="bg-transparent text-[11px] outline-none text-txt-secondary cursor-pointer hover:text-txt py-0.5"
              >
                <option value="">{t('input.depends_none', lang)}</option>
                {dependableTasks.map(task => (
                  <option key={task.id} value={task.id}>
                    #{task.id} {task.title.slice(0, 25)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <span className="ml-auto hidden sm:inline text-txt-muted text-[10px]">
            {t('input.hint', lang)}
          </span>
        </div>
      </div>
    </div>
  )
}
