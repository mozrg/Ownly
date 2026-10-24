import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function stroke(paths: React.ReactNode) {
  return function Icon({ size = 18, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

function solid(paths: React.ReactNode) {
  return function Icon({ size = 18, ...props }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...props}>
        {paths}
      </svg>
    )
  }
}

export const IconHome = stroke(
  <>
    <path d="M3 10.4 12 3l9 7.4V20a1 1 0 0 1-1 1h-5.2v-6.4H9.2V21H4a1 1 0 0 1-1-1z" />
  </>,
)

export const IconSearch = stroke(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.5 16.5 4.5 4.5" />
  </>,
)

export const IconLibrary = stroke(
  <>
    <rect x="3" y="3" width="5" height="18" rx="1.2" />
    <rect x="10.2" y="3" width="5" height="18" rx="1.2" />
    <path d="m18.4 4.3 3.3 15.6" />
  </>,
)



export const IconDisc = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.6" />
  </>,
)

export const IconMusic = stroke(
  <>
    <path d="M9 18V5.2L20 3v12.6" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="15.6" r="3" />
  </>,
)

export const IconHeart = stroke(
  <path d="M20.6 5.9a5.4 5.4 0 0 0-7.7 0L12 6.8l-.9-.9a5.4 5.4 0 1 0-7.7 7.7L12 22.2l8.6-8.6a5.4 5.4 0 0 0 0-7.7z" />,
)

export const IconHeartFilled = solid(
  <path d="M20.6 5.9a5.4 5.4 0 0 0-7.7 0L12 6.8l-.9-.9a5.4 5.4 0 1 0-7.7 7.7L12 22.2l8.6-8.6a5.4 5.4 0 0 0 0-7.7z" />,
)

export const IconPlay = solid(<path d="M7.5 4.6c0-.9 1-1.5 1.8-1l10.4 7.1c.7.5.7 1.6 0 2.1L9.3 20c-.8.5-1.8-.1-1.8-1z" />)

export const IconPause = solid(
  <>
    <rect x="6.5" y="4" width="4" height="16" rx="1.3" />
    <rect x="13.5" y="4" width="4" height="16" rx="1.3" />
  </>,
)

export const IconSkipBack = solid(
  <>
    <path d="M20 5.2c0-.8-.9-1.3-1.6-.8L10 11.2V5a1 1 0 1 0-2 0v14a1 1 0 1 0 2 0v-6.2l8.4 6.8c.7.5 1.6 0 1.6-.8z" />
  </>,
)

export const IconSkipForward = solid(
  <>
    <path d="M4 5.2c0-.8.9-1.3 1.6-.8L14 11.2V5a1 1 0 0 1 2 0v14a1 1 0 0 1-2 0v-6.2l-8.4 6.8c-.7.5-1.6 0-1.6-.8z" />
  </>,
)

export const IconShuffle = stroke(
  <>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </>,
)

export const IconRepeat = stroke(
  <>
    <path d="M17 2.5 21 6.5l-4 4" />
    <path d="M3 12.5v-2a4 4 0 0 1 4-4h14" />
    <path d="M7 21.5 3 17.5l4-4" />
    <path d="M21 11.5v2a4 4 0 0 1-4 4H3" />
  </>,
)

export const IconRepeatOne = stroke(
  <>
    <path d="M17 2.5 21 6.5l-4 4" />
    <path d="M3 12.5v-2a4 4 0 0 1 4-4h14" />
    <path d="M7 21.5 3 17.5l4-4" />
    <path d="M21 11.5v2a4 4 0 0 1-4 4H3" />
    <path d="M11.4 9.8h1.2v4.4" strokeWidth={1.5} />
  </>,
)

export const IconMore = solid(
  <>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </>,
)

export const IconPlus = stroke(<path d="M12 5v14M5 12h14" />)
export const IconMinus = stroke(<path d="M5 12h14" />)
export const IconChevronLeft = stroke(<path d="M15 5l-7 7 7 7" />)
export const IconChevronRight = stroke(<path d="M9 5l7 7-7 7" />)
export const IconChevronDown = stroke(<path d="M5 9l7 7 7-7" />)
export const IconChevronUp = stroke(<path d="M5 15l7-7 7 7" />)
export const IconArrowRight = stroke(<path d="M4 12h15M13 6l6 6-6 6" />)

export const IconVolume = stroke(
  <>
    <path d="M11 4.8 6.4 9H2.8v6h3.6L11 19.2z" />
    <path d="M15.4 8.6a4.6 4.6 0 0 1 0 6.8M18.2 5.8a8.6 8.6 0 0 1 0 12.4" />
  </>,
)

export const IconVolumeMute = stroke(
  <>
    <path d="M11 4.8 6.4 9H2.8v6h3.6L11 19.2z" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </>,
)

export const IconQueue = stroke(
  <>
    <path d="M3 6h11M3 11.5h11M3 17h7" />
    <path d="M18 8v11" />
    <circle cx="15.6" cy="19.2" r="2.4" />
  </>,
)

export const IconMic = stroke(
  <>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M19 10.5v1a7 7 0 0 1-14 0v-1M12 18.5V22M8.5 22h7" />
  </>,
)

export const IconMaximize = stroke(
  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />,
)

export const IconMinimize = stroke(
  <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />,
)

export const IconClose = stroke(<path d="M18 6 6 18M6 6l12 12" />)
export const IconSquare = stroke(<rect x="5.5" y="5.5" width="13" height="13" rx="1.6" />)

export const IconTrash = stroke(
  <>
    <path d="M3.5 6.5h17M9 6.5V4.2h6v2.3M6 6.5 7 20h10l1-13.5" />
  </>,
)

export const IconPencil = stroke(
  <>
    <path d="M12.5 20H21" />
    <path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.3 18.7l-4 1 1-4z" />
  </>,
)

export const IconCheck = stroke(<path d="M20 6.5 9.2 17.3 4 12.1" />)

export const IconExternal = stroke(
  <>
    <path d="M18 13.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5" />
    <path d="M15 3h6v6M10.5 13.5 21 3" />
  </>,
)

export const IconInfo = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16.5v-5M12 8h.01" />
  </>,
)

export const IconSparkles = stroke(
  <>
    <path d="m12 3 1.9 4.9L19 9.8l-5.1 1.9L12 16.6l-1.9-4.9L5 9.8l5.1-1.9z" />
    <path d="M18.5 15.5 19.4 18l2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" />
  </>,
)

export const IconUsers = stroke(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3.6" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.8M16.5 3.4a3.6 3.6 0 0 1 0 7" />
  </>,
)

export const IconClock = stroke(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.3l3.4 2" />
  </>,
)

export const IconSettings = stroke(
  <>
    <path d="M4 21v-6.5M4 10.5V3M12 21v-9M12 8V3M20 21v-4.5M20 12.5V3" />
    <path d="M1.6 14.5h4.8M9.6 8h4.8M17.6 16.5h4.8" />
  </>,
)


export const IconWaveform = stroke(
  <>
    <path d="M3 10v4M7 6.5v11M11 3.5v17M15 7.5v9M19 10.5v3" />
  </>,
)

export const IconList = stroke(<path d="M4 6.5h16M4 12h16M4 17.5h16" />)

export const IconDownload = stroke(
  <>
    <path d="M12 3.5v11" />
    <path d="M7.5 10.5 12 15l4.5-4.5" />
    <path d="M4.5 18.5h15" />
  </>,
)

export const IconText = stroke(
  <>
    <path d="M5 6.5h14" />
    <path d="M5 12h10" />
    <path d="M5 17.5h7" />
  </>,
)

export const IconGrid = stroke(
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
  </>,
)

export const IconStar = stroke(
  <path d="m12 3.4 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.9l6.1-.9z" />,
)

export const IconFolderPlus = stroke(
  <>
    <path d="M21 13.5V7a2 2 0 0 0-2-2h-7.2l-2-2.4H5a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h7" />
    <path d="M18 15v6M15 18h6" />
  </>,
)

/** The Ownly mark — concentric vinyl grooves, exactly as in the brand sheet. */
export function BrandMark({ size = 22, className, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className} {...props}>
      <path
        d="M0.5 50a49.5 49.5 0 1 0 99 0a49.5 49.5 0 1 0-99 0ZM7.5 50a42.5 42.5 0 1 0 85 0a42.5 42.5 0 1 0-85 0Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d="M12.5 50a37.5 37.5 0 1 0 75 0a37.5 37.5 0 1 0-75 0ZM15 50a35 35 0 1 0 70 0a35 35 0 1 0-70 0Z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        d="M29.5 50a20.5 20.5 0 1 0 41 0a20.5 20.5 0 1 0-41 0ZM38.5 50a11.5 11.5 0 1 0 23 0a11.5 11.5 0 1 0-23 0Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  )
}
