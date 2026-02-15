import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  taskCount: number
  dark: boolean
  lang: Lang
  showGitPanel: boolean
  onToggleTheme: () => void
  onToggleLang: () => void
  onToggleGitPanel: () => void
}

export default function Header({ taskCount, dark, lang, showGitPanel, onToggleTheme, onToggleLang, onToggleGitPanel }: Props) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold leading-tight">{t('app.title', lang)}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('app.subtitle_prefix', lang)} {taskCount} {t('app.subtitle_suffix', lang)}
          </p>
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
