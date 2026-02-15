import type { GitCommit } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'

interface Props {
  commits: GitCommit[]
  lang: Lang
  onClose: () => void
}

// Assign colors to branches for the graph
const BRANCH_COLORS = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#fb923c', // orange
]

export default function GitPanel({ commits, lang, onClose }: Props) {
  // Build a simple lane assignment: main branch = lane 0, others get assigned as they appear
  const laneMap = new Map<string, number>()
  let nextLane = 0

  // Pre-scan refs to assign main to lane 0
  for (const c of commits) {
    const isMain = c.refs.some(r => r.includes('main') || r.includes('master') || r.includes('HEAD'))
    if (isMain && !laneMap.has(c.sha)) {
      laneMap.set(c.sha, 0)
      if (nextLane === 0) nextLane = 1
    }
  }

  // Assign lanes to remaining commits
  for (const c of commits) {
    if (!laneMap.has(c.sha)) {
      // Check if any parent has a lane
      let parentLane = -1
      for (const p of c.parents) {
        if (laneMap.has(p)) {
          parentLane = laneMap.get(p)!
          break
        }
      }
      if (parentLane >= 0) {
        // If this is a branch (parent has multiple children), assign new lane
        const parentChildren = commits.filter(cc => cc.parents.includes(c.parents[0]))
        if (parentChildren.length > 1 && parentLane === 0) {
          laneMap.set(c.sha, nextLane++)
        } else {
          laneMap.set(c.sha, parentLane)
        }
      } else {
        laneMap.set(c.sha, nextLane++)
      }
    }
  }

  return (
    <div className="w-[360px] flex-shrink-0 bg-gray-900 dark:bg-gray-950 text-gray-100 border-l border-gray-800 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold">{t('git.title', lang)}</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none"
        >
          ✕
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 && (
          <p className="px-4 py-8 text-xs text-gray-500 text-center">{t('git.no_commits', lang)}</p>
        )}
        {commits.map((c, i) => {
          const lane = laneMap.get(c.sha) ?? 0
          const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
          const isLast = i === commits.length - 1

          return (
            <div key={c.sha} className="flex px-3 hover:bg-gray-800/50 transition-colors">
              {/* Graph column */}
              <div className="w-8 flex-shrink-0 flex flex-col items-center relative">
                {/* Line above */}
                {i > 0 && (
                  <div className="w-0.5 flex-1" style={{ backgroundColor: color, opacity: 0.4 }} />
                )}
                {/* Dot */}
                <div
                  className="w-3 h-3 rounded-full border-2 flex-shrink-0 z-10"
                  style={{ borderColor: color, backgroundColor: c.refs.length > 0 ? color : 'transparent' }}
                />
                {/* Line below */}
                {!isLast && (
                  <div className="w-0.5 flex-1" style={{ backgroundColor: color, opacity: 0.4 }} />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 py-2 pl-1 min-w-0">
                <div className="flex items-start gap-2">
                  <code className="text-xs text-indigo-400 font-mono flex-shrink-0">{c.short}</code>
                  <span className="text-xs text-gray-200 truncate">{c.message}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-gray-500">{c.author}</span>
                  <span className="text-[10px] text-gray-600">{c.time_ago}</span>
                </div>
                {c.refs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.refs.map(ref => (
                      <span
                        key={ref}
                        className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
                        style={{
                          backgroundColor: color + '22',
                          color: color,
                          border: `1px solid ${color}44`,
                        }}
                      >
                        {ref}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
