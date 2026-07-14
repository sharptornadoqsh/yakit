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

const normalizeTotal = (value: unknown): number | null => {
  const total = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(total) && total >= 0 ? total : null
}

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
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
