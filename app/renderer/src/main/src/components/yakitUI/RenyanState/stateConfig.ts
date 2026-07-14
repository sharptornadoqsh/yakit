export type RenyanStateType = 'empty' | 'loading' | 'error' | 'noPermission' | 'offline'

export const RENYAN_STATE_TRANSLATION_KEYS: Record<
  RenyanStateType,
  { title: string; description: string; icon: RenyanStateType }
> = {
  empty: {
    title: 'Layout.RenyanState.emptyTitle',
    description: 'Layout.RenyanState.emptyDescription',
    icon: 'empty',
  },
  loading: {
    title: 'Layout.RenyanState.loadingTitle',
    description: 'Layout.RenyanState.loadingDescription',
    icon: 'loading',
  },
  error: {
    title: 'Layout.RenyanState.errorTitle',
    description: 'Layout.RenyanState.errorDescription',
    icon: 'error',
  },
  noPermission: {
    title: 'Layout.RenyanState.noPermissionTitle',
    description: 'Layout.RenyanState.noPermissionDescription',
    icon: 'noPermission',
  },
  offline: {
    title: 'Layout.RenyanState.offlineTitle',
    description: 'Layout.RenyanState.offlineDescription',
    icon: 'offline',
  },
}
