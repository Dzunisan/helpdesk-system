import { createElement } from "react";
import {
  AppWindow,
  Banknote,
  Building2,
  CalendarDays,
  CircleHelp,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Folder,
  Headphones,
  IdCard,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Monitor,
  Package,
  Phone,
  Printer,
  Receipt,
  ShieldCheck,
  Smartphone,
  Truck,
  Users,
  Wallet,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * Category icons are stored as lucide names in kebab case ("wifi", "key-round").
 * Only the icons below are bundled; anything else shows a folder.
 */
const ICONS: Record<string, LucideIcon> = {
  "app-window": AppWindow,
  banknote: Banknote,
  "building-2": Building2,
  "calendar-days": CalendarDays,
  "circle-help": CircleHelp,
  "credit-card": CreditCard,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  folder: Folder,
  headphones: Headphones,
  "id-card": IdCard,
  "key-round": KeyRound,
  laptop: Laptop,
  lock: Lock,
  mail: Mail,
  monitor: Monitor,
  package: Package,
  phone: Phone,
  printer: Printer,
  receipt: Receipt,
  "shield-check": ShieldCheck,
  smartphone: Smartphone,
  truck: Truck,
  users: Users,
  wallet: Wallet,
  wifi: Wifi,
  wrench: Wrench,
};

/** The lucide icon for a stored category icon name, e.g. <CategoryIcon name="wifi" className="size-4" /> */
export default function CategoryIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  return createElement(ICONS[name ?? ""] ?? Folder, { className, "aria-hidden": true });
}
