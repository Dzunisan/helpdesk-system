import {
  AppWindow,
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  Car,
  CircleHelp,
  CreditCard,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Headphones,
  HeartPulse,
  IdCard,
  KeyRound,
  Laptop,
  Lightbulb,
  Lock,
  Mail,
  Monitor,
  Package,
  Plane,
  Printer,
  Receipt,
  ShieldCheck,
  Smartphone,
  Truck,
  UsersRound,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * The icons a System Admin can pick for a category (briefing p.63). Stored as the lucide name in
 * kebab case (category.icon, e.g. "key-round"); the seeded categories use the first sixteen.
 */
export const CATEGORY_ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  laptop: { icon: Laptop, label: "Laptop" },
  wifi: { icon: Wifi, label: "Wi-Fi" },
  "key-round": { icon: KeyRound, label: "Key" },
  "app-window": { icon: AppWindow, label: "App window" },
  printer: { icon: Printer, label: "Printer" },
  monitor: { icon: Monitor, label: "Monitor" },
  "credit-card": { icon: CreditCard, label: "Credit card" },
  lock: { icon: Lock, label: "Lock" },
  "circle-help": { icon: CircleHelp, label: "Question" },
  banknote: { icon: Banknote, label: "Banknote" },
  "file-text": { icon: FileText, label: "Document" },
  "calendar-days": { icon: CalendarDays, label: "Calendar" },
  "building-2": { icon: Building2, label: "Building" },
  "id-card": { icon: IdCard, label: "ID card" },
  receipt: { icon: Receipt, label: "Receipt" },
  "file-spreadsheet": { icon: FileSpreadsheet, label: "Spreadsheet" },
  smartphone: { icon: Smartphone, label: "Phone" },
  headphones: { icon: Headphones, label: "Headset" },
  mail: { icon: Mail, label: "Email" },
  "shield-check": { icon: ShieldCheck, label: "Security" },
  wrench: { icon: Wrench, label: "Repair" },
  car: { icon: Car, label: "Car" },
  truck: { icon: Truck, label: "Truck" },
  plane: { icon: Plane, label: "Travel" },
  package: { icon: Package, label: "Package" },
  briefcase: { icon: Briefcase, label: "Briefcase" },
  "users-round": { icon: UsersRound, label: "People" },
  "graduation-cap": { icon: GraduationCap, label: "Training" },
  "heart-pulse": { icon: HeartPulse, label: "Wellness" },
  lightbulb: { icon: Lightbulb, label: "Idea" },
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** The lucide component for a stored icon name; unknown names fall back to a question mark */
export const categoryIcon = (name: string | null | undefined): LucideIcon =>
  CATEGORY_ICONS[name ?? ""]?.icon ?? CircleHelp;
