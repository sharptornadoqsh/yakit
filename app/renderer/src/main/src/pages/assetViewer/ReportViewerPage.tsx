import React, { useEffect, useMemo, useState } from 'react'
import { YakitResizeBox } from '@/components/yakitUI/YakitResizeBox/YakitResizeBox'
import { YakitCard } from '@/components/yakitUI/YakitCard/YakitCard'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { QuestionMarkCircleIcon, RefreshIcon } from '@/assets/newIcon'
import { Pagination, Space, Tooltip } from 'antd'
import { OutlineClipboardlistIcon, OutlineTrashIcon } from '@/assets/icon/outline'
import { RollingLoadList } from '@/components/RollingLoadList/RollingLoadList'
import { genDefaultPagination, QueryGeneralRequest, QueryGeneralResponse } from '../invoker/schema'
import { yakitNotify } from '@/utils/notification'
import { Report } from './models'
import { formatTimestamp } from '@/utils/timeUtil'
import { YakitTag } from '@/components/yakitUI/YakitTag/YakitTag'
import { SelectIcon } from '@/assets/icons'
import classNames from 'classnames'
import { useCampare } from '@/hook/useCompare/useCompare'
import { useCreation, useMemoizedFn } from 'ahooks'
import { YakitPopconfirm } from '@/components/yakitUI/YakitPopconfirm/YakitPopconfirm'
import {
  GetReleaseEdition,
  isCommunityIRify,
  isEnpriTraceIRify,
  isIRify,
  PRODUCT_RELEASE_EDITION,
} from '@/utils/envfile'
import { openABSFileLocated } from '@/utils/openWebsite'
import { yakitDialog } from '@/services/electronBridge'
import { YakitSpin } from '@/components/yakitUI/YakitSpin/YakitSpin'
import { ReportItem } from './reportRenders/schema'
import { saveAs } from 'file-saver'
import htmlDocx from 'html-docx-js/dist/html-docx'
import { YakitEmpty } from '@/components/yakitUI/YakitEmpty/YakitEmpty'
import { showYakitModal } from '@/components/yakitUI/YakitModal/YakitModalConfirm'
import { YakitEditor } from '@/components/yakitUI/YakitEditor/YakitEditor'
import { YakitDropdownMenu } from '@/components/yakitUI/YakitDropdownMenu/YakitDropdownMenu'
import { SafeMarkdown } from './reportRenders/markdownRender'
import { FoldTable, JSONTableRender, ReportMergeTable, RiskTable } from './reportRenders/jsonTableRender'
import { PieGraph } from '../graph/PieGraph'
import { BarGraph } from '../graph/BarGraph'
import {
  EchartsCard,
  EchartsOption,
  HollowPie,
  MultiPie,
  NightingleRose,
  StackedVerticalBar,
  VerticalOptionBar,
} from './reportRenders/EchartsInit'
import { FoldHoleCard, FoldRuleCard } from './reportRenders/ReportExtendCard'
import { AutoCard } from '@/components/AutoCard'
import styles from './ReportViewerPage.module.scss'
import { getEnvTypeByProjects } from '../softwareSettings/ProjectManage'
import { handleOpenFileSystemDialog } from '@/utils/fileSystemDialog'
import emiter from '@/utils/eventBus/eventBus'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { CodeScanTaskList } from '../yakRunnerCodeScan/CodeScanTaskListDrawer/CodeScanTaskListDrawer'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { RuiYanPanel } from '@/components/renyanUI'
const { ipcRenderer } = window.require('electron')

interface ReportViewerPageProp {}
export const ReportViewerPage: React.FC<ReportViewerPageProp> = (props) => {
  const [selectReportId, setSelectReportId] = useState<number>()

  return (
    <div className={styles['reportViewerPage']}>
      <div className={styles['report-workspace']}>
        <YakitResizeBox
          isVer={false}
          lineDirection="left"
          firstNode={<ReportList selectReportId={selectReportId} onSetSelectReportId={setSelectReportId} />}
          firstRatio="31%"
          firstMinSize="280px"
          firstNodeStyle={{ padding: 0, minWidth: 0, overflow: 'hidden' }}
          secondNode={<ReportViewer reportId={selectReportId} />}
          secondRatio="69%"
          secondMinSize="420px"
          secondNodeStyle={{ padding: 0, minWidth: 0, overflow: 'hidden' }}
        ></YakitResizeBox>
      </div>
    </div>
  )
}

interface QueryReportsRequest extends QueryGeneralRequest {
  Title: string
  Owner: string
  From: string
  Keyword: string
  Type?: 'ssa_project' | 'project'
}
interface ReportListProp {
  selectReportId?: number
  onSetSelectReportId: (selectReportId?: number) => void
}
const ReportList: React.FC<ReportListProp> = (props) => {
  const { selectReportId, onSetSelectReportId } = props
  const { t } = useI18nNamespaces(['assetViewer'])
  const [query, setQuery] = useState<QueryReportsRequest>({
    From: '',
    Keyword: '',
    Owner: '',
    Title: '',
    Pagination: genDefaultPagination(20),
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [isRefresh, setIsRefresh] = useState<boolean>(false)
  const [response, setResponse] = useState<QueryGeneralResponse<Report>>({
    Data: [],
    Pagination: genDefaultPagination(20),
    Total: 0,
  })
  const [selectList, setSelectList] = useState<Report[]>([])
  const compareSelectList = useCampare(selectList)
  const selectedRowKeys = useCreation(() => {
    return selectList.map((item) => item.Id)
  }, [compareSelectList])
  const [createVisible, setCreateVisible] = useState<boolean>(false)

  const onCheckboxSingle = (selectedRows: Report) => {
    if (!selectedRowKeys.includes(selectedRows.Id)) {
      setSelectList((s) => [...s, selectedRows])
    } else {
      setSelectList((s) => s.filter((ele) => ele.Id !== selectedRows.Id))
    }
  }

  useEffect(() => {
    update(1)
  }, [])

  const onRefreshDBReportFun = useMemoizedFn(() => {
    update(1)
  })

  useEffect(() => {
    emiter.on('onRefreshDBReport', onRefreshDBReportFun)
    return () => {
      emiter.off('onRefreshDBReport', onRefreshDBReportFun)
    }
  }, [])

  useEffect(() => {
    ipcRenderer.on('fetch-simple-open-report', (e, reportId: number) => {
      update(1)
      reportId && onSetSelectReportId(reportId)
    })
    return () => {
      ipcRenderer.removeAllListeners('fetch-simple-open-report')
    }
  }, [])

  const update = (page: number) => {
    setLoading(true)
    const paginationProps = {
      ...query.Pagination,
      Page: page,
      Limit: 20,
    }
    const finalParams: QueryReportsRequest = {
      ...query,
      Pagination: paginationProps,
      Type: getEnvTypeByProjects(),
    }
    const isInit = page === 1
    ipcRenderer
      .invoke('QueryReports', finalParams)
      .then((res: QueryGeneralResponse<Report>) => {
        if (res.Data.length) {
          setQuery((prevQuery) => ({
            ...prevQuery,
            Pagination: {
              ...prevQuery.Pagination,
              Page: +res.Pagination.Page,
            },
          }))
        }
        const d = isInit ? res.Data : (response?.Data || []).concat(res.Data)
        const isMore = res.Data.length < res.Pagination.Limit || d.length == response.Total
        setHasMore(!isMore)
        setResponse({
          ...res,
          Data: d,
        })
        if (isInit) {
          setIsRefresh((prevIsRefresh) => !prevIsRefresh)
          setSelectList([])
        }
      })
      .catch((e) => {
        yakitNotify('error', `Query Reports Failed: ${e}`)
      })
      .finally(() => setLoading(false))
  }

  const onRemove = useMemoizedFn(() => {
    setLoading(true)
    ipcRenderer
      .invoke('DeleteReport', {
        Type: getEnvTypeByProjects(),
        IDs: selectedRowKeys,
        DeleteAll: selectedRowKeys.length === 0,
      })
      .then(() => {
        selectedRowKeys.length === 0 && onSetSelectReportId(undefined)
        if (selectReportId && selectedRowKeys.includes(selectReportId)) {
          onSetSelectReportId(undefined)
        }
        update(1)
      })
      .catch((e: any) => {})
      .finally(() => setLoading(false))
  })

  return (
    <RuiYanPanel
      className={styles['report-list-panel']}
      bodyClassName={styles['report-list-body']}
      title={
        <span className={styles['card-title']}>
          <span className={styles['card-title-text']}>{t('ReportViewerPage.reportList')}</span>
        </span>
      }
      extra={
        <div className={styles['card-extra']}>
          <Tooltip title={t('ReportViewerPage.clickToInspect')} placement="bottom">
            <YakitButton type="text" icon={<QuestionMarkCircleIcon />} size="small"></YakitButton>
          </Tooltip>
          <YakitButton
            type="text"
            icon={<RefreshIcon />}
            size="small"
            onClick={() => {
              update(1)
            }}
          ></YakitButton>
          <YakitPopconfirm
            title={
              selectedRowKeys.length > 0
                ? t('ReportViewerPage.deleteSelectedConfirm')
                : t('ReportViewerPage.deleteAllConfirm')
            }
            onConfirm={onRemove}
            disabled={!response.Data.length}
          >
            <YakitButton
              type="text"
              icon={<OutlineTrashIcon />}
              danger
              size="small"
              disabled={!response.Data.length}
            ></YakitButton>
          </YakitPopconfirm>
          {isIRify() && (
            <YakitButton
              type="primary"
              icon={<OutlineClipboardlistIcon />}
              size="small"
              onClick={() => setCreateVisible(true)}
            >
              {t('ReportViewerPage.generateReport')}
            </YakitButton>
          )}
        </div>
      }
    >
      <div className={styles['card-body']}>
        <RollingLoadList<Report>
          loading={loading}
          isRef={isRefresh}
          hasMore={hasMore}
          data={response.Data}
          page={response.Pagination.Page}
          loadMoreData={() => {
            // 请求下一页数据
            update(+response.Pagination.Page + 1)
          }}
          rowKey="Id"
          defItemHeight={99}
          classNameRow={classNames(styles['list-item'], styles['list-item-hoverable'])}
          renderRow={(item: Report, index) => {
            return (
              <div onClick={() => onSetSelectReportId(item.Id)} key={item.Id}>
                <YakitCard
                  className={classNames(styles['card'], {
                    [styles['card-selected']]: selectReportId === item.Id,
                  })}
                  headClassName={styles['list-item-header']}
                  headStyle={{
                    height: 32,
                    minHeight: 32,
                    boxSizing: 'content-box',
                    borderBottom: selectReportId == item.Id ? '1px solid var(--Colors-Use-Neutral-Border)' : undefined,
                  }}
                  bodyClassName={styles['list-item-body']}
                  bodyStyle={{
                    width: '100%',
                    height: 'calc(100% - 32px)',
                  }}
                  title={
                    <div className={classNames(styles['card-title'])}>
                      <span className={classNames(styles['card-title-text'], 'content-ellipsis')}>{item.Title}</span>
                    </div>
                  }
                  extra={<YakitTag>{formatTimestamp(item.PublishedAt)}</YakitTag>}
                  style={{
                    backgroundColor: selectReportId == item.Id ? 'var(--Colors-Use-Main-Bg-Hover)' : undefined,
                  }}
                >
                  <Tooltip title={t('ReportViewerPage.selectToDelete')}>
                    <SelectIcon
                      // @ts-ignore
                      className={classNames(styles['icon-select'], {
                        [styles['icon-select-active']]: selectedRowKeys.includes(item.Id),
                      })}
                      onClick={(e) => {
                        e.stopPropagation()
                        onCheckboxSingle(item)
                      }}
                    />
                  </Tooltip>
                  <Space wrap={false}>
                    {item.Id && <YakitTag color="red">ID:{item.Id}</YakitTag>}
                    {item.Owner && (
                      <YakitTag color="green">
                        {t('ReportViewerPage.owner')}: {item.Owner}
                      </YakitTag>
                    )}
                    {item.From && (
                      <YakitTag color="warning">
                        {t('ReportViewerPage.source')}: {item.From}
                      </YakitTag>
                    )}
                  </Space>
                </YakitCard>
              </div>
            )
          }}
        ></RollingLoadList>
      </div>
      <YakitModal
        title={t('ReportViewerPage.generateReport')}
        visible={createVisible}
        width={'45%'}
        footer={null}
        onCancel={() => setCreateVisible(false)}
        bodyStyle={{ paddingTop: 0 }}
      >
        {/* <div>请选择扫描结果生成报告</div> */}
        <div className={styles['card-code-scan-task-list']}>
          <CodeScanTaskList visible={createVisible} setVisible={setCreateVisible} readonly={true} />
        </div>
      </YakitModal>
    </RuiYanPanel>
  )
}

// 根据阈值切割报告 用于分页显示 性能优化项
const truncateArrayBySize = (arr: ReportItem[], maxSizeKB: number, maxItemsPerChunk = 250): ReportItem[][] => {
  const maxSizeBytes = maxSizeKB * 1024
  let currentChunkSize = 0
  const result: ReportItem[][] = [[]]
  for (const item of arr) {
    const itemSize = new Blob([JSON.stringify(item)]).size
    const currentChunk = result[result.length - 1]

    // 如果加入该 item 会超过最大字节限制 或者 超过最大数量限制，创建新的 chunk
    if (currentChunkSize + itemSize > maxSizeBytes || currentChunk.length >= maxItemsPerChunk) {
      result.push([])
      currentChunkSize = 0
    }
    result[result.length - 1].push(item)
    currentChunkSize += itemSize
  }

  return result
}

interface ReportViewerProp {
  reportId?: number
}
const ReportViewer: React.FC<ReportViewerProp> = (props) => {
  const { reportId } = props
  const { t } = useI18nNamespaces(['assetViewer', 'yakitUi'])
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<Report>({
    From: '',
    Hash: '',
    Id: 0,
    JsonRaw: '-',
    Owner: '-',
    PublishedAt: 0,
    Title: '-',
  })
  const [allReportItems, setAllReportItems] = useState<ReportItem[][]>([])
  const [current, setCurrent] = useState<number>(1)
  const [reportItems, setReportItems] = useState<ReportItem[]>([])
  const [downloadLoading, setDownloadLoading] = useState<boolean>(false)

  useEffect(() => {
    if ((reportId || 0) <= 0) {
      setReport({
        ...report,
        Id: 0,
      })
      return
    }

    setLoading(true)
    ipcRenderer
      .invoke('QueryReport', { Id: reportId, Type: getEnvTypeByProjects() })
      .then((r: Report) => {
        if (r) setReport(r)
      })
      .catch((e) => {
        yakitNotify('error', `Query Report[${props.reportId}] failed`)
      })
      .finally(() => setTimeout(() => setLoading(false), 100))
  }, [reportId])

  useEffect(() => {
    try {
      const items = report.JsonRaw && report.JsonRaw !== '-' && (JSON.parse(report.JsonRaw) as ReportItem[])
      if (!!items && items.length > 0) {
        const newReportItems = truncateArrayBySize(items, 90) // 每页90KB
        setAllReportItems(newReportItems)
        setReportItems(newReportItems[0])
      }
    } catch (e) {
      yakitNotify('error', `Parse Report[${props.reportId}]'s items failed`)
    }
  }, [report])

  const downloadPdf = useMemoizedFn(async () => {
    if (!report.JsonRaw || report.JsonRaw === '-') {
      yakitNotify('error', t('ReportViewerPage.emptyReportData'))
      return
    }
    setDownloadLoading(true)
    try {
      // 先让 loading 渲染一帧，避免系统保存弹窗前无反馈
      await new Promise((resolve) => setTimeout(resolve, 0))
      const saveRes = await yakitDialog.showSaveDialog(`${report.Title}.pdf`)
      if (saveRes.canceled || !saveRes.filePath) {
        return
      }
      await ipcRenderer.invoke('PrintReportPdfFromTemplate', {
        outputPath: saveRes.filePath,
        JsonRaw: report.JsonRaw,
        reportName: report.Title,
        hideCatalog: true,
      })
      yakitNotify('success', t('ReportViewerPage.exportSuccess'))
    } catch (e) {
      yakitNotify('error', `Export PDF failed: ${e}`)
    } finally {
      setDownloadLoading(false)
    }
  })

  // 下载HTML
  const downloadHtml = () => {
    handleOpenFileSystemDialog({ title: t('ReportViewerPage.selectFolder'), properties: ['openDirectory'] }).then(
      (data) => {
        if (data.filePaths.length) {
          setDownloadLoading(true)
          let absolutePath = data.filePaths[0].replace(/\\/g, '\\')
          ipcRenderer
            .invoke('DownloadHtmlReport', {
              JsonRaw: report.JsonRaw,
              outputDir: absolutePath,
              reportName: report.Title,
            })
            .then((r) => {
              if (r?.ok) {
                yakitNotify('success', t('ReportViewerPage.exportSuccess'))
                r?.outputDir && openABSFileLocated(r.outputDir)
              }
            })
            .catch((e) => {
              yakitNotify('error', `Download Html Report failed ${e}`)
            })
            .finally(() => setDownloadLoading(false))
        }
      },
    )
  }

  // 下载Word
  const downloadWord = async () => {
    setDownloadLoading(true)
    await exportToWord()
  }
  // 下载报告
  const exportToWord = async () => {
    try {
      const html = await ipcRenderer.invoke('RenderReportWordHtml', {
        JsonRaw: report.JsonRaw,
        reportName: report.Title,
      })
      saveAs(htmlDocx.asBlob(html), `${report.Title}.docx`)
      yakitNotify('success', t('ReportViewerPage.exportSuccess'))
    } catch (error) {
      yakitNotify('error', `Export Word failed: ${error}`)
    } finally {
      setDownloadLoading(false)
    }
  }

  const onChangePagination = (page: number) => {
    setReportItems(allReportItems[page - 1] || [])
    setCurrent(page)
  }

  const getDownloadMenu = useMemo(() => {
    if (GetReleaseEdition() === PRODUCT_RELEASE_EDITION.Yakit) {
      return [
        {
          key: 'pdf',
          label: 'Pdf',
        },
      ]
    } else if (isCommunityIRify() || isEnpriTraceIRify()) {
      return [
        {
          key: 'pdf',
          label: 'Pdf',
        },
        {
          key: 'html',
          label: 'HTML',
        },
        {
          key: 'word',
          label: 'Word',
        },
      ]
    } else {
      return [
        {
          key: 'html',
          label: 'HTML',
        },
        {
          key: 'word',
          label: 'Word',
        },
      ]
    }
  }, [])

  return (
    <div className={styles['report-viewer']}>
      {report.Id <= 0 ? (
        <YakitEmpty title={t('ReportViewerPage.selectReport')} className={styles['report-empty']}></YakitEmpty>
      ) : loading ? (
        <YakitSpin spinning={loading} wrapperClassName={styles['loading-wrapper']}></YakitSpin>
      ) : (
        <YakitSpin spinning={downloadLoading}>
          <RuiYanPanel
            className={styles['report-preview-panel']}
            bodyClassName={styles['report-preview-body']}
            title={
              <span className={styles['card-title']}>
                <span className={styles['card-title-text']}>{report.Title}</span>
                <YakitTag>{reportId}</YakitTag>
              </span>
            }
            extra={
              <div className={styles['card-extra']}>
                <YakitButton
                  size="small"
                  onClick={() => {
                    const m = showYakitModal({
                      title: 'RAW DATA',
                      content: (
                        <div style={{ height: 300 }}>
                          <YakitEditor value={report.JsonRaw} />
                        </div>
                      ),
                      width: '50%',
                      onOk: () => {
                        m.destroy()
                      },
                    })
                  }}
                >
                  RAW
                </YakitButton>
                <YakitDropdownMenu
                  menu={{
                    data: getDownloadMenu,
                    onClick: ({ key }) => {
                      switch (key) {
                        case 'html':
                          downloadHtml()
                          return
                        case 'word':
                          downloadWord()
                          return
                        case 'pdf':
                          downloadPdf()
                          return
                        default:
                          return
                      }
                    },
                  }}
                  dropdown={{
                    trigger: ['click'],
                    placement: 'bottom',
                  }}
                >
                  <YakitButton size="small">{t('YakitButton.download')}</YakitButton>
                </YakitDropdownMenu>
              </div>
            }
          >
            <div className={classNames(styles['card-body'], styles['report-content-scroll'])}>
              <Space direction={'vertical'} style={{ width: '100%' }}>
                {reportItems.map((i, index) => (
                  <ReportItemRender item={i} key={index} />
                ))}
              </Space>
            </div>
            {allReportItems.length > 1 && (
              <div className={styles['pagination']}>
                <Pagination
                  size="small"
                  total={allReportItems.length}
                  current={current}
                  pageSize={1}
                  showTotal={(total) => (
                    <div style={{ color: 'var(--Colors-Use-Neutral-Text-1-Title)' }}>
                      {t('ReportViewerPage.pages', { total })}
                    </div>
                  )}
                  onChange={onChangePagination}
                />
              </div>
            )}
          </RuiYanPanel>
        </YakitSpin>
      )}
    </div>
  )
}

interface ReportItemRenderProp {
  item: ReportItem
}
const ReportItemRender: React.FC<ReportItemRenderProp> = (props) => {
  const { type, content } = props.item
  switch (type) {
    case 'markdown':
      return <SafeMarkdown source={props.item.content} />
    case 'json-table':
      return <JSONTableRender item={props.item} />
    case 'pie-graph':
      try {
        return (
          <PieGraph
            type={'pie'}
            height={300}
            data={JSON.parse(props.item.content) as { key: string; value: number }[]}
          />
        )
      } catch (e) {
        return (
          <div style={{ height: 300 }}>
            <YakitEditor value={props.item.content} />
          </div>
        )
      }
    case 'bar-graph':
      try {
        return (
          <BarGraph
            type={'bar'}
            width={450}
            direction={props.item?.direction}
            data={JSON.parse(props.item.content) as { key: string; value: number }[]}
          />
        )
      } catch (e) {
        return (
          <div style={{ height: 300 }}>
            <YakitEditor value={props.item.content} />
          </div>
        )
      }
    case 'raw':
      try {
        const newData = JSON.parse(content)
        if (newData.type === 'report-cover') {
          return <div style={{ height: 0 }}></div>
        } else if (newData.type === 'bar-graph') {
          let color = newData?.color
          let name = (newData?.data || []).map((item) => item.name)
          let value = (newData?.data || []).map((item) => item.value)
          let title = newData?.title
          let obj = { name, value, color, title }
          return <VerticalOptionBar content={obj} />
        } else if (newData.type === 'pie-graph') {
          return <HollowPie data={newData.data} title={newData.title} />
        } else if (newData.type === 'fix-list') {
          return <FoldHoleCard data={newData.data} />
        } else if (newData.type === 'info-risk-list') {
          return <FoldTable data={newData} />
        } else {
          // kv图 南丁格尔玫瑰图 多层饼环
          const content = typeof newData === 'string' ? JSON.parse(newData) : newData
          const { type, data } = content
          if (type) {
            switch (type) {
              case 'multi-pie':
                return <MultiPie content={content} />
              case 'nightingle-rose':
                return <NightingleRose content={content} />
              // 通用kv
              case 'general':
                // kv图展示柱状图
                return <VerticalOptionBar content={content} />
              // echarts任意图表
              case 'e-chart':
                return <EchartsOption content={content} />
              case 'year-cve':
                return <StackedVerticalBar content={content} />
              case 'card':
                const dataTitle = content?.name_verbose || content?.name || ''
                return <EchartsCard dataTitle={dataTitle} dataSource={data} />
              case 'fix-array-list':
                return <FoldRuleCard content={content} />
              case 'risk-list':
                return <RiskTable data={content} />
              case 'potential-risks-list':
                return <RiskTable data={content} />
              case 'search-json-table':
                return <ReportMergeTable data={content} />
              default:
                return (
                  <AutoCard
                    style={{ width: '100%' }}
                    size={'small'}
                    extra={<YakitTag color="danger">{props.item.type}</YakitTag>}
                  >
                    <div style={{ height: 300 }}>
                      <YakitEditor value={props.item.content} />
                    </div>
                  </AutoCard>
                )
            }
          }
        }
      } catch (error) {
        return (
          <AutoCard
            style={{ width: '100%' }}
            size={'small'}
            extra={<YakitTag color="danger">{props.item.type}</YakitTag>}
          >
            <div style={{ height: 300 }}>
              <YakitEditor value={props.item.content} />
            </div>
          </AutoCard>
        )
      }
      return null
    default:
      return (
        <AutoCard
          style={{ width: '100%' }}
          size={'small'}
          extra={<YakitTag color="danger">{props.item.type}</YakitTag>}
        >
          <div style={{ height: 300 }}>
            <YakitEditor value={props.item.content} />
          </div>
        </AutoCard>
      )
  }
}
