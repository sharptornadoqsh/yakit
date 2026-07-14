import { describe, expect, it } from 'vitest'
import { mapRenyanHomeMetrics } from '../homeMetrics'

describe('mapRenyanHomeMetrics', () => {
  it('maps values returned by the project, traffic, and risk queries', () => {
    expect(
      mapRenyanHomeMetrics({
        project: { ProjectName: 'Project Alpha', FileSize: '24 MB' },
        trafficTotal: 12,
        riskLevels: [
          { Value: 'high', Verbose: 'High', Total: 2 },
          { Value: 'low', Verbose: 'Low', Total: '3' },
        ],
      }),
    ).toEqual({
      projectName: 'Project Alpha',
      projectFileSize: '24 MB',
      trafficTotal: 12,
      riskTotal: 5,
      riskLevels: [
        { key: 'high', label: 'High', total: 2 },
        { key: 'low', label: 'Low', total: 3 },
      ],
    })
  })

  it('preserves genuine zero values', () => {
    const metrics = mapRenyanHomeMetrics({ trafficTotal: 0, riskLevels: [] })
    expect(metrics.trafficTotal).toBe(0)
    expect(metrics.riskTotal).toBe(0)
  })

  it('uses null for missing or invalid query values instead of synthetic counts', () => {
    expect(
      mapRenyanHomeMetrics({
        project: { ProjectName: '   ', FileSize: '' },
        trafficTotal: 'unavailable',
        riskLevels: null,
      }),
    ).toEqual({
      projectName: null,
      projectFileSize: null,
      trafficTotal: null,
      riskTotal: null,
      riskLevels: [],
    })
  })

  it('ignores malformed risk totals while retaining valid records', () => {
    const metrics = mapRenyanHomeMetrics({
      riskLevels: [
        { Value: 'invalid', Total: -1 },
        { Verbose: 'Medium', Total: 4 },
      ],
    })
    expect(metrics.riskTotal).toBe(4)
    expect(metrics.riskLevels).toEqual([{ key: 'Medium', label: 'Medium', total: 4 }])
  })
})
