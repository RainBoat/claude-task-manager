import { Sun, Moon, GitBranch, Languages } from 'lucide-react'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import type { ProjectStats } from '../hooks/useStats'

interface Props {
  taskCount: number
  dark: boolean
  lang: Lang
  showGitPanel: boolean
  stats: ProjectStats | null
  onToggleTheme: () => void
  onToggleLang: () => void
  onToggleGitPanel: () => void
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

export default function Header({ taskCount, dark, lang, showGitPanel, stats, onToggleTheme, onToggleLang, onToggleGitPanel }: Props) {
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="px-4 sm:px-6 h-12 flex items-center justify-between pl-14 md:pl-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-accent glow-indigo" />
            <h1 className="text-sm font-semibold text-txt tracking-tight">
              <span className="font-mono">{t('app.title_prefix', lang)}</span>{' '}
              <span className="text-txt-secondary font-normal">{t('app.title_suffix', lang)}</span>
            </h1>
          </div>

          {/* Stats badges */}
          {stats && (
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono">
              {stats.success_rate !== null && (
                <span className={`px-2 py-0.5 rounded-md font-medium ${
                  stats.success_rate >= 80 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : stats.success_rate >= 50 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}>
                  {stats.success_rate}%
                </span>
              )}
              {stats.avg_duration_seconds !== null && (
                <span className="px-2 py-0.5 rounded-md bg-surface-light text-txt-secondary">
                  ~{formatDuration(stats.avg_duration_seconds)}
                </span>
              )}
              {stats.in_progress > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent font-medium">
                  {stats.in_progress} {lang === 'zh' ? '进行中' : 'active'}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-md text-txt-muted">
                {taskCount} {lang === 'zh' ? '任务' : 'tasks'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onToggleGitPanel}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
              showGitPanel
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-surface-light text-txt-secondary hover:text-txt'
            }`}
            title={t('git.toggle', lang)}
          >
            <GitBranch size={14} />
            <span className="hidden sm:inline font-mono">{t('git.toggle', lang)}</span>
          </button>
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg hover:bg-surface-light text-txt-secondary hover:text-txt transition-all duration-150"
            title={dark ? t('theme.light', lang) : t('theme.dark', lang)}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button
            onClick={onToggleLang}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-surface-light text-txt-secondary hover:text-txt transition-all duration-150 text-xs font-medium"
          >
            <Languages size={14} />
            <span className="font-mono">{lang === 'zh' ? 'EN' : '中文'}</span>
          </button>
        </div>
      </div>
    </header>
  )
}
