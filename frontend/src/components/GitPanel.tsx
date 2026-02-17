import { useState, useRef, useCallback, useLayoutEffect } from 'react'
import { X, ChevronRight, Loader2 } from 'lucide-react'
import type { GitCommit, GitFileChange } from '../types'
import type { Lang } from '../i18n'
import { t } from '../i18n'
import { fetchCommitDetail } from '../api'

interface Props {
  commits: GitCommit[]
  lang: Lang
  projectId: string
  onClose: () => void
}

// ── Constants ──────────────────────────────────────────────

const ROW_H = 36
const LANE_W = 16
const NODE_R = 4.5
const LINE_W = 2
const BRANCH_COLORS = [
  '#818cf8', // indigo (primary)
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#c084fc', // purple
  '#fb923c', // orange
  '#22d3ee', // cyan
]

// ── Graph topology types ───────────────────────────────────

interface GraphNode {
  lane: number
  color: string
  isMerge: boolean
}

interface GraphEdge {
  fromRow: number
  fromLane: number
  toRow: number
  toLane: number
  color: string
}

interface GraphResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxLanes: number
}

// ── Lane assignment algorithm ──────────────────────────────

function buildGraph(commits: GitCommit[]): GraphResult {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  // activeLanes[i] = sha that "owns" lane i, or null if free
  const activeLanes: (string | null)[] = []
  const shaToRow = new Map<string, number>()
  const shaToLane = new Map<string, number>()

  commits.forEach((c, idx) => shaToRow.set(c.sha, idx))

  for (let idx = 0; idx < commits.length; idx++) {
    const c = commits[idx]
    const isMerge = c.parents.length > 1

    // 1. Find lane for this commit (check if reserved by a child)
    let myLane = activeLanes.indexOf(c.sha)
    if (myLane === -1) {
      // Not reserved — allocate first free slot
      myLane = activeLanes.indexOf(null)
      if (myLane === -1) {
        myLane = activeLanes.length
        activeLanes.push(null)
      }
    }
    // Clear ALL occurrences of this SHA in activeLanes (fixes duplicate reservation bug)
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === c.sha) activeLanes[i] = null
    }
    shaToLane.set(c.sha, myLane)

    const color = BRANCH_COLORS[myLane % BRANCH_COLORS.length]

    // 2. Handle parents
    if (c.parents.length > 0) {
      const firstParent = c.parents[0]
      const firstParentRow = shaToRow.get(firstParent)

      if (firstParentRow !== undefined) {
        // Clear any existing reservations for firstParent to prevent duplicates
        for (let i = 0; i < activeLanes.length; i++) {
          if (activeLanes[i] === firstParent) activeLanes[i] = null
        }
        // First parent inherits same lane
        activeLanes[myLane] = firstParent
        edges.push({
          fromRow: idx,
          fromLane: myLane,
          toRow: firstParentRow,
          toLane: myLane,
          color,
        })
      }

      // Merge parents (2nd, 3rd, …)
      for (let p = 1; p < c.parents.length; p++) {
        const parentSha = c.parents[p]
        const parentRow = shaToRow.get(parentSha)
        if (parentRow === undefined) continue

        // Check if this parent already has a lane reserved
        let parentLane = activeLanes.indexOf(parentSha)
        if (parentLane === -1) {
          // Not reserved — check if it was already rendered (has a lane)
          const existingLane = shaToLane.get(parentSha)
          if (existingLane !== undefined) {
            parentLane = existingLane
          } else {
            // Allocate new lane
            parentLane = activeLanes.indexOf(null)
            if (parentLane === -1) {
              parentLane = activeLanes.length
              activeLanes.push(null)
            }
            activeLanes[parentLane] = parentSha
          }
        }

        const pColor = BRANCH_COLORS[parentLane % BRANCH_COLORS.length]
        edges.push({
          fromRow: idx,
          fromLane: myLane,
          toRow: parentRow,
          toLane: parentLane,
          color: pColor,
        })
      }
    }

    nodes.push({ lane: myLane, color, isMerge })

    // Trim trailing nulls to keep activeLanes compact
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop()
    }
  }

  const maxLanes = Math.min(
    8,
    Math.max(
      1,
      ...nodes.map(n => n.lane + 1),
      ...edges.map(e => Math.max(e.fromLane, e.toLane) + 1),
    ),
  )

  return { nodes, edges, maxLanes }
}

// ── Single SVG Graph ───────────────────────────────────────

function GitGraph({ nodes, edges, maxLanes, rowYs }: {
  nodes: GraphNode[]
  edges: GraphEdge[]
  maxLanes: number
  rowYs: number[]
}) {
  if (rowYs.length === 0) return null

  const w = maxLanes * LANE_W + LANE_W
  const lastY = rowYs[rowYs.length - 1] ?? 0
  const h = lastY + ROW_H / 2

  const laneX = (lane: number) => lane * LANE_W + LANE_W

  return (
    <svg
      width={w}
      height={h}
      className="absolute top-0 left-0"
      style={{ pointerEvents: 'none' }}
    >
      {/* Edges (behind nodes) */}
      {edges.map((e, i) => {
        const fromX = laneX(e.fromLane)
        const fromY = rowYs[e.fromRow]
        const toX = laneX(e.toLane)
        const toY = rowYs[e.toRow]
        if (fromY === undefined || toY === undefined) return null

        if (fromX === toX) {
          // Straight vertical line
          return (
            <line
              key={`e-${i}`}
              x1={fromX} y1={fromY}
              x2={toX} y2={toY}
              stroke={e.color}
              strokeWidth={LINE_W}
              opacity={0.85}
            />
          )
        }

        // Cross-lane edge: smooth S-curve (cubic bezier)
        const midY = (fromY + toY) / 2
        const d = `M ${fromX} ${fromY} C ${fromX} ${midY} ${toX} ${midY} ${toX} ${toY}`

        return (
          <path
            key={`e-${i}`}
            d={d}
            fill="none"
            stroke={e.color}
            strokeWidth={LINE_W}
            opacity={0.85}
          />
        )
      })}

      {/* Nodes (on top) */}
      {nodes.map((n, i) => {
        const cx = laneX(n.lane)
        const cy = rowYs[i]
        if (cy === undefined) return null

        return n.isMerge ? (
          <g key={`n-${i}`}>
            <circle cx={cx} cy={cy} r={NODE_R + 1} fill="#1e1e2e" stroke={n.color} strokeWidth={2} />
          </g>
        ) : (
          <g key={`n-${i}`}>
            <circle cx={cx} cy={cy} r={NODE_R} fill={n.color} />
            <circle cx={cx} cy={cy} r={NODE_R} fill="none" stroke="#1e1e2e" strokeWidth={2} />
          </g>
        )
      })}
    </svg>
  )
}

// ── File status icon ───────────────────────────────────────

function FileStatusIcon({ status }: { status: string }) {
  if (status === 'A') return <span className="text-[10px] font-bold text-green-400 w-4 text-center">+</span>
  if (status === 'D') return <span className="text-[10px] font-bold text-red-400 w-4 text-center">&minus;</span>
  if (status === 'R') return <span className="text-[10px] font-bold text-yellow-400 w-4 text-center">R</span>
  return <span className="text-[10px] font-bold text-blue-400 w-4 text-center">~</span>
}

// ── Stat bar (GitHub-style green/red) ──────────────────────

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions
  if (total === 0) return null
  const maxBlocks = 5
  const addBlocks = Math.round((additions / total) * maxBlocks) || (additions > 0 ? 1 : 0)
  const delBlocks = Math.round((deletions / total) * maxBlocks) || (deletions > 0 ? 1 : 0)

  return (
    <span className="inline-flex gap-px ml-2 items-center flex-shrink-0">
      <span className="text-[9px] text-green-400 mr-0.5">+{additions}</span>
      <span className="text-[9px] text-red-400 mr-1">-{deletions}</span>
      {Array.from({ length: addBlocks }).map((_, i) => (
        <span key={`a${i}`} className="w-1.5 h-1.5 rounded-sm bg-green-500" />
      ))}
      {Array.from({ length: delBlocks }).map((_, i) => (
        <span key={`d${i}`} className="w-1.5 h-1.5 rounded-sm bg-red-500" />
      ))}
    </span>
  )
}

// ── File change row ────────────────────────────────────────

function FileChangeRow({ file }: { file: GitFileChange }) {
  const parts = file.path.split('/')
  const fileName = parts.pop()!
  const dirPath = parts.length > 0 ? parts.join('/') + '/' : ''

  return (
    <div className="flex items-center gap-1.5 py-0.5 px-2 hover:bg-surface-light/30 rounded text-[11px]">
      <FileStatusIcon status={file.status} />
      <span className="truncate min-w-0 flex-1 font-mono">
        <span className="text-txt-muted">{dirPath}</span>
        <span className="text-txt">{fileName}</span>
      </span>
      <StatBar additions={file.additions} deletions={file.deletions} />
    </div>
  )
}

// ── Commit detail (expanded) ───────────────────────────────

function CommitDetail({ projectId, sha, lang }: { projectId: string; sha: string; lang: Lang }) {
  const [files, setFiles] = useState<GitFileChange[] | null>(null)
  const [loading, setLoading] = useState(true)
  const fetched = useRef(false)

  if (!fetched.current) {
    fetched.current = true
    fetchCommitDetail(projectId, sha)
      .then(data => setFiles(data.files))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false))
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-[11px] text-txt-muted">
        <Loader2 size={12} className="animate-spin" />
        {t('git.loading', lang)}
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div className="py-2 px-3 text-[11px] text-txt-muted">
        {t('git.no_changes', lang)}
      </div>
    )
  }

  const totalAdd = files.reduce((s, f) => s + f.additions, 0)
  const totalDel = files.reduce((s, f) => s + f.deletions, 0)

  return (
    <div className="pb-1.5 pt-0.5">
      <div className="text-[10px] text-txt-muted px-3 pb-1">
        {t('git.files_changed', lang).replace('{n}', String(files.length))}
        <span className="ml-2 text-green-400">+{totalAdd}</span>
        <span className="ml-1 text-red-400">-{totalDel}</span>
      </div>
      <div className="space-y-px">
        {files.map(f => <FileChangeRow key={f.path} file={f} />)}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────

export default function GitPanel({ commits, lang, projectId, onClose }: Props) {
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const [rowYs, setRowYs] = useState<number[]>([])

  const { nodes, edges, maxLanes } = buildGraph(commits)
  const graphW = maxLanes * LANE_W + LANE_W

  // Measure actual row positions after render (handles expanded rows)
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const containerTop = container.offsetTop
    const ys: number[] = []
    for (let i = 0; i < commits.length; i++) {
      const el = rowRefs.current[i]
      if (el) {
        // Node Y = top of the row wrapper + half of the fixed commit-row height
        ys.push(el.offsetTop - containerTop + ROW_H / 2)
      } else {
        ys.push(i * ROW_H + ROW_H / 2)
      }
    }
    setRowYs(ys)
  }, [commits, expandedSha])

  const toggleExpand = useCallback((sha: string) => {
    setExpandedSha(prev => prev === sha ? null : sha)
  }, [])

  return (
    <div className="w-[340px] flex-shrink-0 bg-surface text-txt border-l border flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border flex-shrink-0">
        <h2 className="text-xs font-semibold text-txt-secondary uppercase tracking-wider">{t('git.title', lang)}</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-txt-muted hover:text-txt hover:bg-surface-light transition-all duration-150"
        >
          <X size={15} />
        </button>
      </div>

      {/* Commit list */}
      <div className="flex-1 overflow-y-auto">
        {commits.length === 0 && (
          <p className="px-4 py-8 text-xs text-txt-muted text-center">{t('git.no_commits', lang)}</p>
        )}
        {commits.length > 0 && (
          <div ref={containerRef} className="relative overflow-hidden">
            {/* Single SVG graph overlay */}
            <GitGraph nodes={nodes} edges={edges} maxLanes={maxLanes} rowYs={rowYs} />

            {/* Commit rows */}
            {commits.map((c, i) => {
              const node = nodes[i]
              const isExpanded = expandedSha === c.sha

              return (
                <div
                  key={c.sha}
                  ref={el => { rowRefs.current[i] = el }}
                >
                  {/* Commit row */}
                  <div
                    className="flex cursor-pointer hover:bg-surface-light/50 transition-all duration-100"
                    style={{ minHeight: ROW_H, paddingLeft: graphW }}
                    onClick={() => toggleExpand(c.sha)}
                  >
                    {/* Info column */}
                    <div className="flex-1 py-1.5 pr-3 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight
                          size={10}
                          className={`flex-shrink-0 text-txt-muted transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <span className="text-[11px] text-txt truncate leading-snug">{c.message}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 pl-4">
                        <code className="text-[10px] text-accent font-mono flex-shrink-0">{c.short}</code>
                        <span className="text-[10px] text-txt-muted truncate">{c.author}</span>
                        <span className="text-[10px] text-txt-muted flex-shrink-0">{c.time_ago}</span>
                      </div>
                      {c.refs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 pl-4">
                          {c.refs.map(ref => {
                            const isHead = ref.includes('HEAD')
                            return (
                              <span
                                key={ref}
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-mono"
                                style={{
                                  backgroundColor: isHead ? 'var(--color-accent, #818cf8)' + '20' : node.color + '15',
                                  color: isHead ? 'var(--color-accent, #818cf8)' : node.color,
                                  border: `1px solid ${isHead ? 'var(--color-accent, #818cf8)' : node.color}30`,
                                  ...(isHead ? { boxShadow: `0 0 6px ${node.color}25` } : {}),
                                }}
                              >
                                {ref}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      className="border-t border-dashed border-surface-light mb-1"
                      style={{ marginLeft: graphW, marginRight: 8 }}
                    >
                      <CommitDetail projectId={projectId} sha={c.sha} lang={lang} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
