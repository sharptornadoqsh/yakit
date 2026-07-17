export interface RenyanProjectMetricSource {
  ProjectName?: string
  FileSize?: string
}

export interface RenyanRiskMetricSource {
  Value?: string
  Verbose?: string
  Total?: number | string
}

export interface RenyanRiskMetric {
  key: string
  label: string
  total: number
}

export interface RenyanHomeMetricSnapshot {
  projectName: string | null
  projectFileSize: string | null
  trafficTotal: number | null
  riskTotal: number | null
  riskLevels: RenyanRiskMetric[]
}

export interface RenyanTrafficInsightSource {
  CreatedAt?: number
  IsHTTPS?: boolean
  IsWebsocket?: boolean
}

export interface RenyanTrafficTrendPoint {
  key: string
  label: string
  total: number
}

export interface RenyanProtocolMetric {
  key: 'http' | 'https' | 'ws' | 'wss'
  label: 'HTTP' | 'HTTPS' | 'WS' | 'WSS'
  total: number
  ratio: number
}

const normalizeTotal = (value: unknown): number | null => {
  const total = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(total) && total >= 0 ? total : null
}

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const normalizeTimestamp = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value < 10_000_000_000 ? value * 1000 : value
}

const toLocalDateKey = (timestamp: number) => {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export const buildRenyanTrafficTrend = (
  flows: readonly RenyanTrafficInsightSource[],
  options: { days?: number; now?: number } = {},
): RenyanTrafficTrendPoint[] => {
  const days = Math.min(14, Math.max(1, Math.trunc(options.days ?? 7)))
  const today = new Date(options.now ?? Date.now())
  today.setHours(0, 0, 0, 0)
  const counts = new Map<string, number>()

  flows.forEach((flow) => {
    const timestamp = normalizeTimestamp(flow.CreatedAt)
    if (timestamp === null) return
    const key = toLocalDateKey(timestamp)
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - index - 1))
    const key = toLocalDateKey(date.getTime())
    return { key, label: key.slice(5), total: counts.get(key) || 0 }
  })
}

export const buildRenyanProtocolDistribution = (
  flows: readonly RenyanTrafficInsightSource[],
): RenyanProtocolMetric[] => {
  const counts: Record<RenyanProtocolMetric['key'], number> = { http: 0, https: 0, ws: 0, wss: 0 }

  flows.forEach((flow) => {
    const key: RenyanProtocolMetric['key'] = flow.IsWebsocket
      ? flow.IsHTTPS
        ? 'wss'
        : 'ws'
      : flow.IsHTTPS
        ? 'https'
        : 'http'
    counts[key] += 1
  })

  const total = flows.length
  if (total === 0) return []

  return (['http', 'https', 'ws', 'wss'] as const)
    .filter((key) => counts[key] > 0)
    .map((key) => ({
      key,
      label: key.toUpperCase() as RenyanProtocolMetric['label'],
      total: counts[key],
      ratio: counts[key] / total,
    }))
}

export const mapRenyanHomeMetrics = (input: {
  project?: RenyanProjectMetricSource | null
  trafficTotal?: unknown
  riskLevels?: RenyanRiskMetricSource[] | null
}): RenyanHomeMetricSnapshot => {
  const riskLevels =
    input.riskLevels?.reduce<RenyanRiskMetric[]>((items, item, index) => {
      const total = normalizeTotal(item.Total)
      if (total === null) return items

      const key = normalizeText(item.Value) || normalizeText(item.Verbose) || `risk-${index}`
      const label = normalizeText(item.Verbose) || normalizeText(item.Value) || key
      items.push({ key, label, total })
      return items
    }, []) || []

  return {
    projectName: normalizeText(input.project?.ProjectName),
    projectFileSize: normalizeText(input.project?.FileSize),
    trafficTotal: normalizeTotal(input.trafficTotal),
    riskTotal: input.riskLevels == null ? null : riskLevels.reduce((total, item) => total + item.total, 0),
    riskLevels,
  }
}
