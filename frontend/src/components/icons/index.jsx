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

export { default as LogoMark } from './LogoMark'

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
