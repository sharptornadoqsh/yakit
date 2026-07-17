import { describe, expect, it } from 'vitest'
import { buildRenyanProtocolDistribution, buildRenyanTrafficTrend, mapRenyanHomeMetrics } from '../homeMetrics'

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

  it('aggregates real traffic samples into a bounded daily trend', () => {
    const now = new Date(2026, 6, 16, 12).getTime()
    const previousDay = new Date(2026, 6, 15, 8).getTime()
    const currentDayInSeconds = Math.floor(new Date(2026, 6, 16, 9).getTime() / 1000)

    expect(
      buildRenyanTrafficTrend([{ CreatedAt: previousDay }, { CreatedAt: currentDayInSeconds }], { days: 3, now }),
    ).toEqual([
      { key: '2026-07-14', label: '07-14', total: 0 },
      { key: '2026-07-15', label: '07-15', total: 1 },
      { key: '2026-07-16', label: '07-16', total: 1 },
    ])
  })

  it('classifies protocol distribution without synthetic categories', () => {
    expect(
      buildRenyanProtocolDistribution([
        { IsHTTPS: false, IsWebsocket: false },
        { IsHTTPS: true, IsWebsocket: false },
        { IsHTTPS: true, IsWebsocket: false },
        { IsHTTPS: true, IsWebsocket: true },
      ]),
    ).toEqual([
      { key: 'http', label: 'HTTP', total: 1, ratio: 0.25 },
      { key: 'https', label: 'HTTPS', total: 2, ratio: 0.5 },
      { key: 'wss', label: 'WSS', total: 1, ratio: 0.25 },
    ])
    expect(buildRenyanProtocolDistribution([])).toEqual([])
  })
})
