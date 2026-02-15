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
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between pl-14 md:pl-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-lg font-semibold leading-tight">{t('app.title', lang)}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('app.subtitle_prefix', lang)} {taskCount} {t('app.subtitle_suffix', lang)}
            </p>
          </div>

          {/* Stats badges */}
          {stats && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              {stats.success_rate !== null && (
                <span className={`px-2 py-0.5 rounded-full font-medium ${
                  stats.success_rate >= 80 ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : stats.success_rate >= 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                }`}>
                  {stats.success_rate}% {lang === 'zh' ? '成功率' : 'success'}
                </span>
              )}
              {stats.avg_duration_seconds !== null && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium">
                  ~{formatDuration(stats.avg_duration_seconds)} {lang === 'zh' ? '平均' : 'avg'}
                </span>
              )}
              {stats.in_progress > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-medium">
                  {stats.in_progress} {lang === 'zh' ? '进行中' : 'active'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleGitPanel}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showGitPanel
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
            title={t('git.toggle', lang)}
          >
            {t('git.toggle', lang)}
          </button>
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
            title={dark ? t('theme.light', lang) : t('theme.dark', lang)}
          >
            {dark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
          <button
            onClick={onToggleLang}
            className="px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-xs font-medium border border-gray-200 dark:border-gray-700"
          >
            {lang === 'zh' ? 'EN' : '\u4E2D\u6587'}
          </button>
        </div>
      </div>
    </header>
  )
}
