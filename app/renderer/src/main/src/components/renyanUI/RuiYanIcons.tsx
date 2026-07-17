import React from 'react'

export type RuiYanIconName =
  | 'search'
  | 'plus'
  | 'replay'
  | 'environment'
  | 'bell'
  | 'user'
  | 'workbench'
  | 'proxy'
  | 'traffic'
  | 'vulnerability'
  | 'brute'
  | 'packet'
  | 'plugin'
  | 'team'
  | 'project'
  | 'settings'
  | 'chevron'
  | 'close'
  | 'check'
  | 'warning'
  | 'error'
  | 'empty'
  | 'loading'
  | 'panel'

export interface RuiYanIconProps extends React.SVGAttributes<SVGSVGElement> {
  name: RuiYanIconName
  title?: string
}

const glyphs: Record<RuiYanIconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  replay: (
    <>
      <path d="M7 7h7a5 5 0 1 1-4.6 7" />
      <path d="m7 3-4 4 4 4" />
    </>
  ),
  environment: (
    <>
      <path d="M4 5h16v12H4z" />
      <path d="M8 21h8M12 17v4M7 9h4M7 13h7" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M10 20h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  workbench: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  proxy: (
    <>
      <path d="M4 7h10M10 3l4 4-4 4M20 17H10M14 13l-4 4 4 4" />
    </>
  ),
  traffic: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19V3" />
    </>
  ),
  vulnerability: (
    <>
      <path d="M12 3 4 7v5c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V7z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  brute: (
    <>
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M9 16h6" />
    </>
  ),
  packet: (
    <>
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M15 3v5h5M8 12h8M8 16h6" />
    </>
  ),
  plugin: (
    <>
      <path d="M8 3v5H3v8h5v5h8v-5h5V8h-5V3z" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 5" />
    </>
  ),
  project: (
    <>
      <path d="M3 6h7l2 2h9v11H3z" />
      <path d="M3 6V4h7l2 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7-.6-1.4.9-1.9-2.1-2.1-1.9.9-1.4-.6L11.5 3h-3l-.7 2-1.4.6-1.9-.9-2.1 2.1.9 1.9-.6 1.4-2 .7v3l2 .7.6 1.4-.9 1.9 2.1 2.1 1.9-.9 1.4.6.7 2h3l.7-2 1.4-.6 1.9.9 2.1-2.1-.9-1.9.6-1.4z" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12 4 4L19 6" />,
  warning: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  empty: (
    <>
      <path d="M4 7h16v13H4z" />
      <path d="m4 7 3-4h10l3 4M8 12h8" />
    </>
  ),
  loading: (
    <>
      <path d="M12 3a9 9 0 1 1-9 9" />
      <path d="M3 6v6h6" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 4v16M12 9h6M12 13h6" />
    </>
  ),
}

export const RuiYanIcon: React.FC<RuiYanIconProps> = ({ name, title, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={title ? undefined : true}
    role={title ? 'img' : undefined}
    {...props}
  >
    {title ? <title>{title}</title> : null}
    {glyphs[name]}
  </svg>
)
