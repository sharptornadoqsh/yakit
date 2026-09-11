;(() => {
  const container = document.getElementById('content')
  const nestedRawTypes = new Set([
    'multi-pie',
    'nightingle-rose',
    'general',
    'year-cve',
    'card',
    'fix-array-list',
    'risk-list',
    'potential-risks-list',
    'search-json-table',
  ])
  const appendText = (value) => {
    const pre = document.createElement('pre')
    pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    container.appendChild(pre)
  }
  const normalizeItem = (item) => {
    if (!item || typeof item !== 'object') return { type: 'code', content: item }
    const content = item.content ?? item.data ?? ''
    if (item.type === 'raw') {
      try {
        const parsed = JSON.parse(content)
        const value = typeof parsed === 'string' ? JSON.parse(parsed) : parsed
        if (!value || typeof value !== 'object' || !value.type) return { ...item, type: 'code', content }
        return { ...item, content: JSON.stringify(nestedRawTypes.has(value.type) ? JSON.stringify(value) : value) }
      } catch {
        return { ...item, type: 'code', content }
      }
    }
    return { ...item, content }
  }
  try {
    const parsed = typeof initData === 'string' ? JSON.parse(initData) : initData
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('没有可导出的报告内容')
    let items = parsed.map(normalizeItem)
    if (new URLSearchParams(location.search).get('jump_link')) {
      try {
        items = getJumpPageData(items)
      } catch {
        appendText('部分条目不支持当前筛选，以下显示完整报告。')
      }
    }
    items.forEach((item) => {
      const content = item.content ?? item.data ?? ''
      try {
        switch (item.type) {
          case 'markdown':
            $('#content').append(
              `<div class="wmde-markdown">${marked.parse(String(content).replaceAll('<script', '&lt;script'))}</div>`,
            )
            break
          case 'pie-graph':
            const pieData = typeof content === 'string' ? JSON.parse(content) : content
            if (Array.isArray(pieData)) {
              createEcharts('e-chart', {
                option: {
                  animation: false,
                  tooltip: {},
                  series: [
                    { type: 'pie', radius: '65%', data: pieData.map(({ key, value }) => ({ name: key, value })) },
                  ],
                },
              })
            } else createEcharts('pie-graph', pieData)
            break
          case 'bar-graph':
            const barData = typeof content === 'string' ? JSON.parse(content) : content
            const category = { type: 'category', data: barData.map((item) => item.key) }
            const value = { type: 'value' }
            const horizontal = item.direction ?? true
            createEcharts('e-chart', {
              option: {
                animation: false,
                tooltip: {},
                grid: { containLabel: true },
                xAxis: horizontal ? value : category,
                yAxis: horizontal ? category : value,
                series: [{ type: 'bar', data: barData.map((item) => item.value) }],
              },
            })
            break
          case 'vertical-bar-graph':
          case 'horizontal-bar-graph':
            createEcharts(item.type, content)
            break
          case 'multi-pie':
          case 'nightingle-rose':
            createEcharts(item.type, item)
            break
          case 'general':
            createEcharts('vertical-bar-graph', item)
            break
          case 'divider':
            container.appendChild(document.createElement('hr'))
            break
          case 'json-table':
            createTable(content)
            break
          case 'raw':
            createRawView(content)
            break
          case 'wordcloud':
            createWordCloud(typeof content === 'string' ? JSON.parse(content) : content)
            break
          case 'json':
            const json = typeof content === 'string' ? JSON.parse(content) : content
            if (json && typeof json === 'object' && 'title' in json && 'raw' in json) createJsonView(json)
            else appendText(content)
            break
          default:
            appendText(content)
        }
      } catch {
        appendText(content)
      }
    })
    $('#markdown-bar').append(renderToc(tocItems))
    window.__reportExportReady = true
  } catch (error) {
    window.__reportExportError = error.message
    appendText(error.message)
  }
})()
