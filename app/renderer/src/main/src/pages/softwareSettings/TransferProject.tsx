import React, { memo, useEffect, useRef, useState } from 'react'
import { useMemoizedFn } from 'ahooks'
import { Progress } from 'antd'
import { RuiYanModal } from '@/components/renyanUI/RuiYanPrimitives'
import classNames from 'classnames'
import { YakitButton } from '@/components/yakitUI/YakitButton/YakitButton'
import { useTemporaryProjectStore } from '@/store/temporaryProject'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { failed } from '@/utils/notification'
import { openABSFileLocated } from '@/utils/openWebsite'
import { isIRify } from '@/utils/envfile'
import emiter from '@/utils/eventBus/eventBus'
import { runProjectTransfer } from '@/pages/teamCollaboration/projectTransfer'
import { ProjectExportSvgIcon, ProjectImportSvgIcon } from './icon'
import type { ExportProjectProps, ImportProjectProps } from './ProjectManage'
import styles from './ProjectManage.module.scss'

const { ipcRenderer } = window.require('electron')

export interface TransferProjectProps {
  usedBy?: string
  isExport?: boolean
  isImport?: boolean
  data?: ExportProjectProps | ImportProjectProps
  visible: boolean
  setVisible: (open: boolean) => any
  onSuccess: (type: string) => any
  onError?: (message: string) => void
  embedded?: boolean
}
export interface ProjectIOProgress {
  TargetPath: string
  Percent: number
  Verbose: string
}
export const TransferProject: React.FC<TransferProjectProps> = memo((props) => {
  const { t } = useI18nNamespaces(['projectManage', 'yakitUi'])
  const { usedBy, isExport, isImport, data, visible, setVisible, onSuccess, onError, embedded = false } = props

  const { isExportTemporaryProjectFlag, setIsExportTemporaryProjectFlag } = useTemporaryProjectStore()

  const [percent, setPercent] = useState<number>(0.0)
  const [infos, setInfos] = useState<string[]>([])
  const activeTransfer = useRef<AbortController>()
  const reportError = useMemoizedFn((message: string) => {
    onError?.(message)
    failed(message)
  })
  const finishTransfer = useMemoizedFn((type?: string, path?: string) => {
    try {
      if (type) onSuccess(type)
    } finally {
      setVisible(false)
    }
    if (type === 'isExport' && path) openABSFileLocated(path)
  })

  useEffect(() => {
    if (!visible) return
    setPercent(0)
    setInfos([])
    if ((!isExport && !isImport) || !data) {
      failed(t('NewProjectAndFolder.dataErrorRetry'))
      finishTransfer()
      return
    }
    const controller = new AbortController()
    activeTransfer.current = controller
    let active = true
    let lastMessage = ''
    const params = isExport
      ? { Id: (data as ExportProjectProps).Id, Password: data.Password || '' }
      : { ...data, Password: data.Password || '', Type: isIRify() ? 'ssa_project' : 'project' }
    runProjectTransfer(ipcRenderer, {
      channel: isExport ? 'ExportProject' : 'ImportProject',
      params,
      signal: controller.signal,
      requireTargetPath: Boolean(isExport),
      onProgress: (progress) => {
        if (!active) return
        if (typeof progress.Percent === 'number') setPercent(progress.Percent * 100)
        if (progress.Verbose) {
          lastMessage = progress.Verbose
          setInfos((current) => [...current.slice(-99), progress.Verbose!])
        }
      },
    })
      .then((path) => {
        if (active) finishTransfer(isExport ? 'isExport' : 'isImport', path)
      })
      .catch((error: Error) => {
        if (!active) return
        if (error.name !== 'AbortError') {
          reportError(`项目${isExport ? '导出' : '导入'}失败：${error.message}${lastMessage ? `；${lastMessage}` : ''}`)
        }
        finishTransfer()
      })
    return () => {
      active = false
      controller.abort()
      if (activeTransfer.current === controller) activeTransfer.current = undefined
    }
  }, [visible, data, isExport, isImport, finishTransfer, reportError, t])

  // 处理导出临时项目问题
  const handleExportTemporaryProject = () => {
    // 当是加密导出 点击组件TransferProject取消时不执行删除操作
    if (isExportTemporaryProjectFlag && usedBy !== 'NewProjectAndFolder') {
      setIsExportTemporaryProjectFlag(false)
      // 发送信号到ProjectManage去执行 getPageInfo(同时删除临时项目也是在这里操作的)
      emiter.emit('onGetProjectInfo')
    }
  }
  const onClose = useMemoizedFn(() => {
    activeTransfer.current?.abort()
    handleExportTemporaryProject()
    setVisible(false)
  })

  if (!visible) return null
  const content = (
    <div className={styles['modal-transfer-project']} data-testid="project-transfer-content" aria-live="polite">
      <div className={styles['transfer-project-wrapper']}>
        <div className={styles['modal-left-wrapper']}>
          <div className={styles['modal-icon']}>
            {isExport && <ProjectExportSvgIcon />}
            {isImport && <ProjectImportSvgIcon />}
          </div>
        </div>

        <div className={styles['modal-right-wrapper']}>
          <div className={styles['modal-right-title']}>
            {isExport && t('TransferProject.projectExporting')}
            {isImport && t('TransferProject.projectImporting')}
          </div>
          <div className={styles['download-progress']}>
            <Progress
              strokeColor="var(--Colors-Use-Main-Primary)"
              trailColor="var(--Colors-Use-Neutral-Bg)"
              percent={+percent.toFixed(2)}
              format={(p, sp) => {
                return (
                  <div className={styles['progress-content-style']}>{`${t('TransferProject.progress')} ${p}%`}</div>
                )
              }}
            />
          </div>
          <div className={styles['modal-right-content']}>
            {infos.map((item, index) => {
              return (
                <div
                  key={index}
                  className={classNames({
                    [styles['error-style']]: item.indexOf('error') > -1,
                  })}
                >
                  {item}
                </div>
              )
            })}
          </div>
          <div className={styles['modal-right-btn']}>
            <YakitButton size="max" type="outline2" onClick={onClose}>
              {t('YakitButton.cancel')}
            </YakitButton>
          </div>
        </div>
      </div>
    </div>
  )
  return embedded ? (
    content
  ) : (
    <RuiYanModal open={visible} title={isImport ? '导入项目' : '导出项目'} width={720} onClose={onClose} footer={null}>
      {content}
    </RuiYanModal>
  )
})
