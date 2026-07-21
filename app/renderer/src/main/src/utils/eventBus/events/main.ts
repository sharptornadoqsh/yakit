import { MultipleNodeInfo, OnlyPageCache } from '@/pages/layout/mainOperatorContent/MainOperatorContentType'

export type MainOperatorEventProps = {
  /** 远程打开一个页面 */
  openPage: string
  /** 远程关闭一个页面 */
  closePage: string
  /** 请求在关闭检查后关闭一级页面 */
  requestCloseFirstMenu: OnlyPageCache
  /**通过焦点关闭二级页面 */
  onRemoveSecondPageByFocus: string
  /**关闭二级页面前是否校验 */
  onCloseSubPageByJudge: string
  /**通过信息关闭二级页面 */
  onCloseSubPageByInfo: string
  /** 从顶部菜单打开一个页面 */
  menuOpenPage: string

  /**二级路由Tab数据变化 */
  secondMenuTabDataChange: string
  /**复制 webfuzzer 标签页 */
  onDuplicateWebFuzzerTabs: { item: MultipleNodeInfo; count: number }
}
