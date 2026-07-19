import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API } from '@/services/swagger/resposeType'
import { apiFetchQueryAllTask } from '@/components/MessageCenter/utils'
import emiter from '@/utils/eventBus/eventBus'
import { isEnpriTrace } from '@/utils/envfile'
import { formatTimestampJudge } from '@/utils/timeUtil'
import styles from './RenyanTaskCenter.module.scss'

interface RenyanTaskCenterProps {
  enabled: boolean
}

type TaskStatusTone = 'pending' | 'complete' | 'cancelled' | 'unknown'

export const getTaskStatusPresentation = (status: number): { label: string; tone: TaskStatusTone } => {
  if (status === 1) return { label: '\u5f85\u63a5\u6536', tone: 'pending' }
  if (status === 2) return { label: '\u5df2\u5b8c\u6210', tone: 'complete' }
  if (status === 3) return { label: '\u5df2\u53d6\u6d88', tone: 'cancelled' }
  return { label: '\u72b6\u6001\u672a\u77e5', tone: 'unknown' }
}

export const RenyanTaskCenter: React.FC<RenyanTaskCenterProps> = React.memo(({ enabled }) => {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<API.MessageLogDetail[]>([])
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const available = enabled && isEnpriTrace()

  const refresh = useCallback(async () => {
    if (!available) {
      setTasks([])
      setError('')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await apiFetchQueryAllTask()
      setTasks(response.data || [])
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : '\u4efb\u52a1\u6570\u636e\u8bfb\u53d6\u5931\u8d25',
      )
    } finally {
      setLoading(false)
    }
  }, [available])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!available) return
    const onMessage = (_data: string) => {
      void refresh()
    }
    emiter.on('onRefreshMessageSocket', onMessage)
    return () => emiter.off('onRefreshMessageSocket', onMessage)
  }, [available, refresh])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const summary = useMemo(() => {
    if (!available) return '\u534f\u4f5c\u4efb\u52a1\u4e0d\u53ef\u7528'
    if (loading && tasks.length === 0) return '\u6b63\u5728\u8bfb\u53d6\u4efb\u52a1'
    return `${tasks.length} \u6761\u5f85\u5904\u7406`
  }, [available, loading, tasks.length])

  const openMessageCenter = () => {
    setOpen(false)
    emiter.emit('openAllMessageNotification')
  }

  return (
    <div className={styles['task-center']}>
      <button
        ref={buttonRef}
        type="button"
        className={styles['task-trigger']}
        aria-expanded={open}
        aria-controls="renyan-task-center-panel"
        aria-label={`\u4efb\u52a1\u4e2d\u5fc3\uff0c${summary}`}
        onClick={() => {
          setOpen((value) => !value)
          if (!open) void refresh()
        }}
      >
        <span>{'\u4efb\u52a1\u4e2d\u5fc3'}</span>
        {tasks.length > 0 ? <strong>{tasks.length}</strong> : null}
      </button>

      {open ? (
        <section
          ref={panelRef}
          id="renyan-task-center-panel"
          className={styles['task-panel']}
          role="dialog"
          aria-labelledby="renyan-task-center-title"
        >
          <header className={styles['task-panel-header']}>
            <div>
              <h2 id="renyan-task-center-title">{'\u4efb\u52a1\u4e2d\u5fc3'}</h2>
              <p>{summary}</p>
            </div>
            <button type="button" disabled={loading || !available} onClick={() => void refresh()}>
              {'\u5237\u65b0'}
            </button>
          </header>

          <div className={styles['task-list']}>
            {!available ? (
              <div className={styles['task-empty']}>
                {
                  '\u767b\u5f55\u4f01\u4e1a\u534f\u4f5c\u670d\u52a1\u540e\u663e\u793a\u771f\u5b9e\u4efb\u52a1\u901a\u77e5'
                }
              </div>
            ) : null}
            {available && loading && tasks.length === 0 ? (
              <div className={styles['task-empty']} role="status">
                {'\u6b63\u5728\u8bfb\u53d6\u4efb\u52a1\u6570\u636e'}
              </div>
            ) : null}
            {available && error ? (
              <div className={styles['task-error']} role="alert">
                {error}
              </div>
            ) : null}
            {available && !loading && !error && tasks.length === 0 ? (
              <div className={styles['task-empty']}>{'\u6682\u65e0\u5f85\u5904\u7406\u4efb\u52a1'}</div>
            ) : null}
            {tasks.length > 0 ? (
              <div className={styles['task-table-header']} aria-hidden="true">
                <span>{'\u4efb\u52a1\u540d\u79f0'}</span>
                <span>{'\u4efb\u52a1\u8bf4\u660e'}</span>
                <span>{'\u72b6\u6001'}</span>
                <span>{'\u66f4\u65b0\u65f6\u95f4'}</span>
              </div>
            ) : null}
            {tasks.map((task, index) => {
              const status = getTaskStatusPresentation(task.status)
              const timestamp = task.updated_at || task.created_at
              return (
                <article
                  className={styles['task-item']}
                  key={task.hash || task.subTaskId || `${task.taskName}-${index}`}
                >
                  <div className={styles['task-item-heading']}>
                    <strong>{task.taskName || '\u672a\u547d\u540d\u4efb\u52a1'}</strong>
                    <span className={`${styles['task-status']} ${styles[`task-status-${status.tone}`]}`}>
                      {status.label}
                    </span>
                  </div>
                  {task.description ? <p>{task.description}</p> : null}
                  <time>{timestamp ? formatTimestampJudge(timestamp * 1000) : '\u65f6\u95f4\u672a\u77e5'}</time>
                </article>
              )
            })}
          </div>

          <footer className={styles['task-panel-footer']}>
            <button type="button" onClick={openMessageCenter}>
              {'\u5728\u6d88\u606f\u4e2d\u5fc3\u5904\u7406'}
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  )
})
