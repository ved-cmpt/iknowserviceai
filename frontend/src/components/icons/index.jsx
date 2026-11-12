import { useId } from 'react'
import {
  Accessibility,
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Command,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSearch,
  FileText,
  Flag,
  GitFork,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  Keyboard,
  LayoutDashboard,
  Library,
  ListChecks,
  Lock,
  LogOut,
  MessageSquare,
  Minus,
  Moon,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Sun,
  Tag,
  Ticket,
  TriangleAlert,
  User,
  UserCheck,
  X,
} from 'lucide-react'

// Icons come from Lucide (ISC licence), imported one by one so only these reach the bundle
// (ADR-062). They are decorative: the text beside them carries the meaning.
const ICONS = {
  accessibility: Accessibility,
  activity: Activity,
  alert: TriangleAlert,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  audit: ScrollText,
  book: BookOpen,
  bot: Bot,
  check: Check,
  checkCircle: CircleCheck,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  clock: Clock,
  command: Command,
  dashboard: LayoutDashboard,
  database: Database,
  edit: Pencil,
  external: ExternalLink,
  eye: Eye,
  eyeOff: EyeOff,
  file: FileText,
  fileSearch: FileSearch,
  flag: Flag,
  fork: GitFork,
  help: CircleHelp,
  history: History,
  home: House,
  inbox: Inbox,
  info: Info,
  key: KeyRound,
  keyboard: Keyboard,
  library: Library,
  listChecks: ListChecks,
  lock: Lock,
  logout: LogOut,
  message: MessageSquare,
  minus: Minus,
  moon: Moon,
  newRequest: SquarePen,
  panel: PanelLeft,
  pause: Pause,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  server: Server,
  shield: ShieldCheck,
  shieldAlert: ShieldAlert,
  sparkle: Sparkles,
  sun: Sun,
  tag: Tag,
  ticket: Ticket,
  user: User,
  userCheck: UserCheck,
  x: X,
  xCircle: CircleX,
}

export default function Icon({ name, size = 16, className, strokeWidth = 1.75 }) {
  const Component = ICONS[name]
  if (!Component) return null
  return (
    <Component
      className={['icon', className].filter(Boolean).join(' ')}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
    />
  )
}

// The brand mark: a reply card with a check, "AI drafts, people approve". The same shapes as
// scripts/brand/build.mjs, which documents them. useId keeps gradient IDs unique per instance.
export function LogoMark({ size = 24, small = size <= 32 }) {
  const id = `iks-mark-${useId().replace(/[^\w-]/g, '')}`
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox={small ? '0 0 32 32' : '0 0 64 64'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF9A3C" />
          <stop offset="0.52" stopColor="#FF4F7B" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      {small ? (
        <>
          <path
            d="M9 3h14a6 6 0 0 1 6 6v9a6 6 0 0 1-6 6h-9.4l-5.4 4.1A.9.9 0 0 1 6.8 27.3L7.4 23.7A6 6 0 0 1 3 18V9a6 6 0 0 1 6-6z"
            fill={`url(#${id})`}
          />
          <path
            d="m10 13.6 4 4 8-8.2"
            stroke="#140A1C"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <path
            d="M18 8h28a12 12 0 0 1 12 12v18a12 12 0 0 1-12 12H27l-10.6 7.9A1.6 1.6 0 0 1 13.9 56.6L15 50.1A12 12 0 0 1 6 38V20A12 12 0 0 1 18 8z"
            fill={`url(#${id})`}
          />
          <path
            d="M17 21h17M17 29.5h9"
            stroke="#140A1C"
            strokeWidth="4.2"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="m31 32 6.2 6.2L49 24.4"
            stroke="#140A1C"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  )
}

// A small picture for empty lists: an empty tray, drawn with the icon stroke.
export function EmptyArt() {
  return (
    <svg
      className="empty-state-art"
      width="72"
      height="56"
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
