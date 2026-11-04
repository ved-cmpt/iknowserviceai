// A small set of original line icons. Decorative by default: the text beside them carries meaning.
const PATHS = {
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  alert: 'M12 3 2 20h20zM12 10v4M12 17.5v.01',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  book: 'M4 5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 0 2 2h14v-4',
  checkCircle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM8 12l3 3 5-6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7v5l3 2',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5M9 13h6M9 17h6',
  flag: 'M5 21V4h13l-3 4 3 4H5',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z',
  key: 'M18 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM11 11l-8 8M6 16l3 3',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  message: 'M4 4h16v12H9l-5 4z',
  minus: 'M5 12h14',
  moon: 'M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11z',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 8a8.5 8.5 0 0 0-15-2L3 8M3 3v5h5M4 16a8.5 8.5 0 0 0 15 2l2-2M21 21v-5h-5',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6zM9 12l2 2 4-4',
  sparkle:
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5',
  tag: 'M3 3h9l9 9-9 9-9-9zM8 8v.01',
  ticket:
    'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4zM14 5v14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
}

export default function Icon({ name, size = 16, className }) {
  return (
    <svg
      className={['icon', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

// The brand mark: a ticket with a check. Original artwork, and the same shape as the favicon.
export function LogoMark({ size = 26 }) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 9a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v3.6a3.4 3.4 0 0 0 0 6.8V23a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-3.6a3.4 3.4 0 0 0 0-6.8z"
        fill="#36b9b0"
      />
      <path
        d="m10.5 16 3.6 3.6 7.4-7.4"
        stroke="#0f1c2e"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// A small picture for empty lists.
export function EmptyArt() {
  return (
    <svg
      className="empty-state-art"
      width="96"
      height="72"
      viewBox="0 0 96 72"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 40 24 14h48l12 26v20a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z" />
      <path d="M12 40h22l5 8h18l5-8h22" />
      <path d="M36 28h24M40 20h16" />
    </svg>
  )
}
