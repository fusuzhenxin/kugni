import {
  Activity,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code2,
  Coins,
  Compass,
  CreditCard,
  FileText,
  Gift,
  Globe2,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  LockKeyhole,
  Megaphone,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

const icons: Record<string, LucideIcon> = {
  activity: Activity,
  arrow: ArrowRight,
  chart: BarChart3,
  bell: Bell,
  book: BookOpen,
  calendar: CalendarDays,
  check: Check,
  chevron: ChevronDown,
  help: CircleHelp,
  clock: Clock3,
  code: Code2,
  coins: Coins,
  compass: Compass,
  credit: CreditCard,
  file: FileText,
  gift: Gift,
  globe: Globe2,
  heart: Heart,
  home: LayoutDashboard,
  grid: LayoutGrid,
  layout: LayoutGrid,
  layers: LayoutGrid,
  link: Link2,
  lock: LockKeyhole,
  megaphone: Megaphone,
  menu: Menu,
  message: MessageSquare,
  plus: Plus,
  search: Search,
  settings: Settings2,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  users: Users,
  user: Users,
  close: X,
  zap: Zap,
  building: Globe2,
  history: Clock3,
  receipt: CreditCard,
  tree: LayoutGrid,
};
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const Glyph = icons[name] || FileText;
  return (
    <Glyph
      size={size}
      strokeWidth={1.7}
      className={className}
      aria-hidden="true"
    />
  );
}
export function Brand() {
  return (
    <span className="brand">
      <img src="/favicon.svg" alt="" width="31" height="31" />
      <span>UGNI</span>
    </span>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
export function Status({ value }: { value: unknown }) {
  const label = String(value ?? "—");
  return (
    <Badge
      tone={
        /通过|正常|启用|完成|投放中|已支付|completed/.test(label)
          ? "green"
          : /异常|驳回|失败|停用|failed/.test(label)
            ? "red"
            : /待|queued|running/.test(label)
              ? "amber"
              : ""
      }
    >
      {label}
    </Badge>
  );
}
export function Empty({
  title = "这里还没有内容",
  description = "有新记录后，会显示在这里。",
  children,
}: {
  title?: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name="compass" size={30} />
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function SectionTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <p className="error-message" role="alert">
      {error}
    </p>
  ) : null;
}
