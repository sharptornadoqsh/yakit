import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { YakitModal } from '@/components/yakitUI/YakitModal/YakitModal'
import { YakitSelect } from '@/components/yakitUI/YakitSelect/YakitSelect'
import { getMe } from '@/services/teamCollaboration'
import { useStore } from '@/store'
import { subscribeTeamAuthenticationInvalidation, subscribeTeamPermissionInvalidation } from './teamPermissionContext'
import { PreparedTeamShare } from './sharedRecordAdapters'
import { SharedRecordError } from './binaryPayload'
import {
  EMPTY_CAPABILITIES,
  isPositiveInteger,
  getErrorStatus,
  getActiveTarget,
  getShareTargetCapabilities,
  sharePreparedTeamRecord,
  readTeamShareBaseUrl,
  ShareTargetCapabilities,
  ShareToTeamProjectSuccess,
  TeamShareStoppedError,
} from './sharedRecordUpload'
import styles from './ShareToTeamProjectModal.module.scss'
export { getShareTargetCapabilities, matchDuplicateHTTPRecord, matchDuplicateRiskRecord } from './sharedRecordUpload'
export type {
  ShareTargetCapabilities,
  ShareTeamTarget,
  ShareProjectTarget,
  ShareToTeamProjectSuccess,
} from './sharedRecordUpload'

export interface ShareToTeamProjectModalProps {
  visible: boolean
  prepared: PreparedTeamShare
  onCancel: () => void
  onSuccess: (result: ShareToTeamProjectSuccess) => void
}

export const ShareToTeamProjectModal: React.FC<ShareToTeamProjectModalProps> = ({
  visible,
  prepared,
  onCancel,
  onSuccess,
}) => {
  const userInfo = useStore((state) => state.userInfo)
  const authenticatedUserId = Number(userInfo.user_id)
  const authenticationSessionKey = `${
    userInfo.isLogin ? 'authenticated' : 'logged-out'
  }\u0000${authenticatedUserId}\u0000${userInfo.token}`
  const [capabilities, setCapabilities] = useState<ShareTargetCapabilities>(EMPTY_CAPABILITIES)
  const [teamId, setTeamId] = useState(0)
  const [projectId, setProjectId] = useState(0)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const contextRef = useRef({
    visible,
    authenticationSessionKey,
    teamId,
    projectId,
    prepared,
  })
  const loadSequence = useRef(0)
  const operationSequence = useRef(0)
  const onSuccessRef = useRef(onSuccess)

  contextRef.current = { visible, authenticationSessionKey, teamId, projectId, prepared }
  onSuccessRef.current = onSuccess

  const invalidate = useCallback((message = '') => {
    loadSequence.current += 1
    operationSequence.current += 1
    contextRef.current.teamId = 0
    contextRef.current.projectId = 0
    setCapabilities(EMPTY_CAPABILITIES)
    setTeamId(0)
    setProjectId(0)
    setLoading(false)
    setSubmitting(false)
    setErrorMessage(message)
  }, [])

  useEffect(() => {
    const unsubscribeAuthentication = subscribeTeamAuthenticationInvalidation(() => {
      invalidate('登录状态已失效，请重新登录')
    })
    const unsubscribePermission = subscribeTeamPermissionInvalidation((invalidatedTeamId) => {
      if (
        contextRef.current.teamId === invalidatedTeamId ||
        capabilities.teams.some((team) => team.id === invalidatedTeamId)
      ) {
        invalidate('团队权限已失效，请重新选择')
      }
    })
    return () => {
      unsubscribeAuthentication()
      unsubscribePermission()
    }
  }, [capabilities.teams, invalidate])

  useEffect(() => {
    const requestSequence = ++loadSequence.current
    operationSequence.current += 1
    setCapabilities(EMPTY_CAPABILITIES)
    setTeamId(0)
    setProjectId(0)
    setErrorMessage('')
    setSubmitting(false)
    if (!visible) {
      setLoading(false)
      return
    }
    if (!userInfo.isLogin || !isPositiveInteger(authenticatedUserId)) {
      setLoading(false)
      setErrorMessage('请先登录后再分享')
      return
    }

    setLoading(true)
    const boundSession = authenticationSessionKey
    getMe()
      .then((response) => {
        if (
          loadSequence.current !== requestSequence ||
          !contextRef.current.visible ||
          contextRef.current.authenticationSessionKey !== boundSession ||
          response.data.user.id !== authenticatedUserId
        ) {
          return
        }
        const next = getShareTargetCapabilities(response.data)
        const teams = next.teams.filter((team) =>
          prepared.kind === 'risk' ? team.canShareRisk : team.canShareHTTPFlow,
        )
        const filtered = {
          canShareHTTPFlow: teams.some((team) => team.canShareHTTPFlow),
          canShareRisk: teams.some((team) => team.canShareRisk),
          teams,
        }
        const firstTeam = teams[0]
        const firstProject = firstTeam?.projects[0]
        contextRef.current.teamId = firstTeam?.id || 0
        contextRef.current.projectId = firstProject?.id || 0
        setCapabilities(filtered)
        setTeamId(firstTeam?.id || 0)
        setProjectId(firstProject?.id || 0)
        if (!firstTeam || !firstProject) setErrorMessage('没有可写入的活动团队项目')
      })
      .catch(() => {
        if (loadSequence.current === requestSequence) invalidate('无法加载团队项目')
      })
      .finally(() => {
        if (loadSequence.current === requestSequence) setLoading(false)
      })
  }, [authenticatedUserId, authenticationSessionKey, invalidate, prepared, userInfo.isLogin, visible])

  const selectedTeam = useMemo(
    () => capabilities.teams.find((team) => team.id === teamId),
    [capabilities.teams, teamId],
  )

  const handleTeamChange = (value: string) => {
    operationSequence.current += 1
    const nextTeamId = Number(value)
    const nextTeam = capabilities.teams.find((team) => team.id === nextTeamId)
    const nextProjectId = nextTeam?.projects[0]?.id || 0
    contextRef.current.teamId = nextTeam?.id || 0
    contextRef.current.projectId = nextProjectId
    setTeamId(nextTeam?.id || 0)
    setProjectId(nextProjectId)
    setSubmitting(false)
    setErrorMessage('')
  }

  const handleProjectChange = (value: string) => {
    operationSequence.current += 1
    const nextProjectId = Number(value)
    const validProjectId = selectedTeam?.projects.some((project) => project.id === nextProjectId) ? nextProjectId : 0
    contextRef.current.projectId = validProjectId
    setProjectId(validProjectId)
    setSubmitting(false)
    setErrorMessage('')
  }

  const handleCancel = () => {
    invalidate()
    onCancel()
  }

  const handleSubmit = async () => {
    if (!visible || !isPositiveInteger(teamId) || !isPositiveInteger(projectId) || submitting) return
    const requestSequence = ++operationSequence.current
    const boundSession = authenticationSessionKey
    const boundTeamId = teamId
    const boundProjectId = projectId
    const boundPrepared = prepared
    const isCurrent = () =>
      operationSequence.current === requestSequence &&
      contextRef.current.visible &&
      contextRef.current.authenticationSessionKey === boundSession &&
      contextRef.current.teamId === boundTeamId &&
      contextRef.current.projectId === boundProjectId &&
      contextRef.current.prepared === boundPrepared

    setSubmitting(true)
    setErrorMessage('')
    try {
      const baseUrl = await readTeamShareBaseUrl()
      if (!isCurrent()) return
      const result = await sharePreparedTeamRecord(boundPrepared, {
        teamId: boundTeamId,
        projectId: boundProjectId,
        userId: authenticatedUserId,
        request: { diyHome: baseUrl, headers: { Authorization: userInfo.token || '' } },
        check: async () => {
          if (!isCurrent() || (await readTeamShareBaseUrl()) !== baseUrl || !isCurrent()) {
            throw new TeamShareStoppedError('共享上下文已变化，请关闭后重新选择')
          }
        },
      })
      if (!isCurrent()) return
      const { httpRecord, riskRecord } = result

      onSuccessRef.current({
        teamId: boundTeamId,
        projectId: boundProjectId,
        flowKey: boundPrepared.http.flowKey,
        riskKey: boundPrepared.kind === 'risk' ? boundPrepared.risk.riskKey : undefined,
        httpRecord,
        riskRecord,
      })
    } catch (error) {
      if (!isCurrent()) return
      if (error instanceof SharedRecordError && error.code === 'shared_record_payload_too_large') {
        setErrorMessage('该流量超过团队共享上限')
        return
      }
      if (error instanceof TeamShareStoppedError) {
        invalidate(error.message)
        return
      }
      const status = getErrorStatus(error)
      if (status === 401 || status === 403) {
        invalidate('团队权限或登录状态已失效，请重新选择')
        return
      }
      setErrorMessage('分享失败，请重试')
    } finally {
      if (isCurrent()) setSubmitting(false)
    }
  }

  const disabled =
    loading ||
    submitting ||
    !isPositiveInteger(teamId) ||
    !isPositiveInteger(projectId) ||
    !getActiveTarget(capabilities, prepared.kind, teamId, projectId)

  return (
    <YakitModal
      visible={visible}
      title={prepared.kind === 'risk' ? '分享 Risk 到团队项目' : '分享 HTTP Flow 到团队项目'}
      okText="分享"
      cancelText="取消"
      confirmLoading={submitting}
      okButtonProps={{ disabled }}
      onCancel={handleCancel}
      onCloseX={handleCancel}
      onOk={handleSubmit}
    >
      <div className={styles['share-form']}>
        <label className={styles['share-field']}>
          <span>团队</span>
          <YakitSelect
            placeholder="团队"
            value={teamId > 0 ? String(teamId) : undefined}
            disabled={loading || submitting}
            options={capabilities.teams.map((team) => ({ value: String(team.id), label: team.name }))}
            onChange={(value) => handleTeamChange(String(value))}
          />
        </label>
        <label className={styles['share-field']}>
          <span>项目</span>
          <YakitSelect
            placeholder="项目"
            value={projectId > 0 ? String(projectId) : undefined}
            disabled={loading || submitting || !selectedTeam}
            options={(selectedTeam?.projects || []).map((project) => ({
              value: String(project.id),
              label: project.name,
            }))}
            onChange={(value) => handleProjectChange(String(value))}
          />
        </label>
        {errorMessage ? (
          <div role="alert" className={styles['share-error']}>
            {errorMessage}
          </div>
        ) : null}
      </div>
    </YakitModal>
  )
}
