import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onModalSecondaryConfirm } from '../modalSecondaryConfirm'

const { confirm, removeKeepSearchRouteNameMap } = vi.hoisted(() => ({
  confirm: vi.fn(),
  removeKeepSearchRouteNameMap: vi.fn(),
}))

vi.mock('@/components/yakitUI/YakitModal/YakitModalConfirm', () => ({
  YakitModalConfirm: confirm,
}))

vi.mock('@/store/keepSearchName', () => ({
  keepSearchNameMapStore: { removeKeepSearchRouteNameMap },
}))

describe('onModalSecondaryConfirm', () => {
  beforeEach(() => {
    confirm.mockReset()
    removeKeepSearchRouteNameMap.mockReset()
  })

  it('确认框销毁后恢复快捷键关闭状态', () => {
    const visibleRef = { current: false }
    const modal = { destroy: vi.fn() }
    let modalProps: any
    confirm.mockImplementation((props) => {
      modalProps = props
      modal.destroy.mockImplementation(() => props.modalAfterClose?.())
      return modal
    })

    onModalSecondaryConfirm(undefined, visibleRef)

    expect(visibleRef.current).toBe(true)
    modalProps.onCloseX()
    expect(modal.destroy).toHaveBeenCalledTimes(1)
    expect(visibleRef.current).toBe(false)
  })

  it('保存回调未销毁确认框时保持快捷键关闭状态', () => {
    const visibleRef = { current: false }
    const modal = { destroy: vi.fn() }
    const onOk = vi.fn()
    let modalProps: any
    confirm.mockImplementation((props) => {
      modalProps = props
      modal.destroy.mockImplementation(() => props.modalAfterClose?.())
      return modal
    })

    onModalSecondaryConfirm({ onOk }, visibleRef)
    modalProps.onOk()

    expect(onOk).toHaveBeenCalledWith(modal)
    expect(visibleRef.current).toBe(true)

    modal.destroy()
    expect(visibleRef.current).toBe(false)
  })
})
