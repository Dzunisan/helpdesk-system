// Fills the database with the Mzansi Freight demo data from the team briefing.
// WARNING: wipes every table first, so it only runs when DB_HOST is localhost/127.0.0.1.
// Run:  npm run db:seed   (or npm run db:reset to rebuild the schema and seed in one go)
//
// Sprint 1 shape (db/migrations/001_lifecycle.sql): seven statuses, Urgent/High/Normal/Low, SLA due
// times from sla_policy, categories that route to a department, and a ticket_event history for every
// ticket. HD-1048 replays the worked example on briefing page 5 (Tuesday 10 November). The highest
// seeded reference is HD-1053, so the first request made in the demo is HD-1054 (pages 14 and 28).
import bcrypt from "bcryptjs";
import { Pool, PoolClient } from "pg";
import { assertLocalDb, dbConfig } from "./db";

export const DEMO_PASSWORD = "Demo2026!";

// ---------- data ----------

const departments = [
  { id: 1, name: "IT Support", description: "Laptops, network, passwords and software" },
  { id: 2, name: "Human Resources", description: "Payroll, leave and employment letters" },
  { id: 3, name: "Facilities", description: "Buildings, desks, parking and access cards" },
  { id: 4, name: "Finance", description: "Claims, invoices and cost centres" },
];

type Role = "Employee" | "Agent" | "Department Lead" | "System Admin" | "Platform Admin";
type U = { id: number; name: string; surname: string; email: string; role: Role; dept: number | null; active?: boolean };

const users: U[] = [
  // The demo logins from the briefing (page 28)
  { id: 1001, name: "Lerato", surname: "Mokoena", email: "lerato", role: "Employee", dept: 4 },
  { id: 1002, name: "Thabo", surname: "Nkosi", email: "thabo", role: "Agent", dept: 1 },
  { id: 1003, name: "Thandi", surname: "Mthembu", email: "thandi", role: "Department Lead", dept: 1 },
  { id: 1004, name: "Ayesha", surname: "Patel", email: "ayesha", role: "Employee", dept: 4 },
  { id: 1005, name: "Ruan", surname: "Steyn", email: "ruan", role: "System Admin", dept: null },
  { id: 1006, name: "Kerry-Anne", surname: "Adams", email: "kerryanne", role: "Platform Admin", dept: null },
  // Extra staff
  { id: 1010, name: "Sipho", surname: "Mahlangu", email: "sipho", role: "Agent", dept: 1 },
  { id: 1011, name: "Megan", surname: "Fourie", email: "megan", role: "Agent", dept: 1 },
  { id: 1012, name: "Nomvula", surname: "Sithole", email: "nomvula", role: "Department Lead", dept: 2 },
  { id: 1013, name: "Priya", surname: "Naidoo", email: "priya", role: "Agent", dept: 2 },
  { id: 1014, name: "Kagiso", surname: "Molefe", email: "kagiso", role: "Department Lead", dept: 3 },
  { id: 1015, name: "Bongani", surname: "Zulu", email: "bongani", role: "Agent", dept: 3 },
  { id: 1016, name: "Bongani", surname: "Mabaso", email: "bongani.mabaso", role: "Department Lead", dept: 4 },
  { id: 1017, name: "Fatima", surname: "Ismail", email: "fatima", role: "Agent", dept: 4 },
  { id: 1018, name: "Busisiwe", surname: "Mkhize", email: "busisiwe", role: "System Admin", dept: null },
  // Extra employees
  { id: 1020, name: "Johan", surname: "van Wyk", email: "johan", role: "Employee", dept: 4 },
  { id: 1021, name: "Pieter", surname: "Botha", email: "pieter", role: "Employee", dept: 3 },
  { id: 1022, name: "Zanele", surname: "Khumalo", email: "zanele", role: "Employee", dept: 3 },
  { id: 1023, name: "Sizwe", surname: "Ndlovu", email: "sizwe", role: "Employee", dept: 2 },
  { id: 1024, name: "Dawid", surname: "Pretorius", email: "dawid", role: "Employee", dept: 1, active: false },
];

const leads: Record<number, number> = { 1: 1003, 2: 1012, 3: 1014, 4: 1016 };

// SLA targets per priority (page 12), minutes
const slaPolicies = [
  { priority: "Urgent", first: 30, resolution: 240 },
  { priority: "High", first: 60, resolution: 480 },
  { priority: "Normal", first: 240, resolution: 1440 },
  { priority: "Low", first: 480, resolution: 4320 },
];

type Priority = "Urgent" | "High" | "Normal" | "Low";
type Field = { key: string; label: string; type: "text" | "number" | "long_text" | "date"; required: boolean; help?: string; unit?: string };
type C = {
  id: number; dept: number; name: string; kind: "fix" | "request"; icon: string; description: string;
  priority?: Priority; approval?: boolean; fields?: Field[];
};

const reasonField: Field = { key: "reason", label: "Why do you need it?", type: "long_text", required: true };

// Categories (pages 14, 38, 63). "fix" = Something is broken, "request" = I need something.
// Approval categories are seeded INACTIVE: they stay off the form until S6 adds approvals in Sprint 2.
const categories: C[] = [
  // IT Support
  { id: 1, dept: 1, name: "Laptop or hardware fault", kind: "fix", icon: "laptop", description: "Laptop, screen, dock, keyboard or mouse not working" },
  { id: 2, dept: 1, name: "Network, Wi-Fi & VPN", kind: "fix", icon: "wifi", description: "Can't connect, slow or dropping connections, VPN problems" },
  { id: 3, dept: 1, name: "Passwords & sign-in", kind: "fix", icon: "key-round", description: "Locked out, password resets, MFA and sign-in errors", priority: "High" },
  { id: 4, dept: 1, name: "Software problem", kind: "fix", icon: "app-window", description: "An app crashes, won't open or behaves strangely" },
  { id: 5, dept: 1, name: "Printers & scanning", kind: "fix", icon: "printer", description: "Paper jams, print queues and scan-to-email" },
  { id: 6, dept: 1, name: "New hardware", kind: "request", icon: "monitor", description: "A laptop, screen, headset or other equipment", approval: true,
    fields: [
      { key: "item", label: "What do you need?", type: "text", required: true },
      { key: "estimated_cost", label: "Estimated cost", type: "number", required: true, unit: "ZAR" },
      reasonField,
    ] },
  { id: 7, dept: 1, name: "Software purchase", kind: "request", icon: "credit-card", description: "A new licence or subscription", approval: true,
    fields: [
      { key: "software_name", label: "Software name", type: "text", required: true },
      { key: "cost_per_year", label: "Estimated cost per year", type: "number", required: true, unit: "ZAR" },
      reasonField,
      { key: "needed_by", label: "Needed by", type: "date", required: false },
    ] },
  { id: 8, dept: 1, name: "Access to a system or folder", kind: "request", icon: "lock", description: "Access to an application, shared folder or mailbox", approval: true,
    fields: [
      { key: "system", label: "System or folder", type: "text", required: true, help: "For example Sage 300 or \\\\finance\\reporting" },
      reasonField,
    ] },
  { id: 9, dept: 1, name: "Something else", kind: "fix", icon: "circle-help", description: "Not sure? The service desk will route it" },
  // Human Resources
  { id: 10, dept: 2, name: "Payroll query", kind: "request", icon: "banknote", description: "Something wrong or missing on your payslip",
    fields: [{ key: "payslip_month", label: "Which payslip?", type: "text", required: true, help: "For example October 2026" }] },
  { id: 11, dept: 2, name: "Employment letter", kind: "request", icon: "file-text", description: "Proof of employment for a bank, embassy or landlord", priority: "Low",
    fields: [{ key: "purpose", label: "What is the letter for?", type: "text", required: true }] },
  { id: 12, dept: 2, name: "Leave", kind: "request", icon: "calendar-days", description: "Leave balances, special leave and leave corrections" },
  // Facilities
  { id: 13, dept: 3, name: "Building & maintenance", kind: "fix", icon: "building-2", description: "Aircon, lights, leaks, furniture and cleaning",
    fields: [{ key: "location", label: "Building and floor", type: "text", required: true, help: "For example Rosebank, 3rd floor" }] },
  { id: 14, dept: 3, name: "Desk, parking & access card", kind: "request", icon: "id-card", description: "A desk, parking bay or new access card",
    fields: [{ key: "location", label: "Which office?", type: "text", required: true }] },
  // Finance
  { id: 15, dept: 4, name: "Travel & expense claims", kind: "request", icon: "receipt", description: "Claims for travel, tolls, meals and other expenses",
    fields: [
      { key: "amount", label: "Amount", type: "number", required: true, unit: "ZAR" },
      { key: "expense_date", label: "Date of the expense", type: "date", required: true },
    ] },
  { id: 16, dept: 4, name: "Invoices & payments", kind: "request", icon: "file-spreadsheet", description: "Supplier invoices, payments and cost centres",
    fields: [
      { key: "invoice_number", label: "Invoice number", type: "text", required: true },
      { key: "supplier", label: "Supplier", type: "text", required: false },
    ] },
];

// The old request types, kept only so their table isn't empty on a fresh database. Nothing reads
// them any more: 001_lifecycle.sql folded them into categories.
const requestTypes = [
  { id: 1, dept: 1, name: "Fix a problem", kind: "fix_it", extra: null },
  { id: 2, dept: 1, name: "Software purchase", kind: "provision", extra: "software_name, cost_per_year, reason, needed_by" },
  { id: 3, dept: 1, name: "New hardware", kind: "provision", extra: "item, estimated_cost, reason" },
  { id: 4, dept: 1, name: "Access to a system or folder", kind: "provision", extra: "system, reason" },
];

type Status = "Pending approval" | "New" | "Open" | "Waiting on employee" | "Resolved" | "Closed" | "Cancelled";

/**
 * A ticket and its story, in minutes before now (or absolute times for HD-1048).
 * Every staff reply in `comments` that is public counts as the first response when it's the first.
 */
type T = {
  id: number; title: string; description: string; cat: number; priority: Priority; status: Status;
  requester: number; assignee?: number; created: Date;
  /** When the owner claimed it (defaults to just before their first reply) */
  claimed?: Date;
  /** When it moved to Waiting on employee */
  waiting?: Date;
  resolved?: Date; resolutionNote?: string;
  closed?: Date;
  cancelled?: Date;
  /** Approval categories that already got past the lead */
  approved?: { by: number; at: Date };
  impact?: "blocks_me" | "slows_me_down" | "minor";
  extra?: Record<string, unknown>;
};

const MIN = 60_000;
const minsAgo = (mins: number) => new Date(Date.now() - mins * MIN);
const hoursAgo = (hours: number) => minsAgo(hours * 60);
const after = (date: Date, mins: number) => new Date(date.getTime() + mins * MIN);

// HD-1048, briefing page 5: Tuesday 10 November 2026, SAST
const sast = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+02:00`);

// SLA states depend on "now" (seed time). With the policies above:
//   Unassigned IT queue: HD-1050 breached (the one rose row), HD-1044 due soon, the rest on track
//   Thabo's open work: HD-1041 breached, HD-1045 on track, HD-1031 waiting on the employee
const tickets: T[] = [
  // ----- IT Support: unassigned queue (New) -----
  { id: 1050, title: "Laptop screen cracked after a fall", description: "Dropped my laptop at the Durban depot, the screen is cracked in the corner and half of it is black.",
    cat: 1, priority: "High", status: "New", requester: 1021, created: hoursAgo(2), impact: "blocks_me" },
  { id: 1044, title: "3rd floor printer in Rosebank keeps jamming", description: "The HP on the 3rd floor jams on every second page. We have a board pack to print today.",
    cat: 5, priority: "Normal", status: "New", requester: 1022, created: minsAgo(200), impact: "slows_me_down" },
  { id: 1046, title: "New starter: laptop & accounts for Sizwe Ndlovu", description: "Sizwe starts in HR on 17 Nov and needs a laptop, email and VPN set up before then.",
    cat: 9, priority: "Normal", status: "New", requester: 1012, created: hoursAgo(2), impact: "minor" },
  { id: 1043, title: "Teams camera not working in Boardroom 2", description: "The room camera shows a black screen in every Teams meeting since this morning.",
    cat: 4, priority: "Normal", status: "New", requester: 1017, created: hoursAgo(1), impact: "slows_me_down" },
  { id: 1035, title: "Wi-Fi drops in the Durban office canteen", description: "Signal disappears near the canteen windows. Fine everywhere else in the building.",
    cat: 2, priority: "Low", status: "New", requester: 1004, created: hoursAgo(5), impact: "minor" },
  { id: 1039, title: "Monitor flickers when laptop is docked", description: "My second screen flickers every few seconds when the laptop is in the dock.",
    cat: 1, priority: "Low", status: "New", requester: 1022, created: minsAgo(330), impact: "slows_me_down" },
  { id: 1037, title: "Aircon dripping onto my desk", description: "Water is dripping from the aircon onto my desk on the 3rd floor in Rosebank. The carpet is soaked.",
    cat: 9, priority: "Normal", status: "New", requester: 1022, created: hoursAgo(1), impact: "blocks_me" }, // misfiled in IT on purpose (S12 demo)

  // ----- IT Support: owned work -----
  { id: 1045, title: "Can't log in to Sage after password change", description: "Sage 300 says invalid credentials since I changed my Windows password this morning.",
    cat: 3, priority: "High", status: "Open", requester: 1020, assignee: 1002, created: hoursAgo(3), claimed: minsAgo(165), impact: "blocks_me" },
  { id: 1041, title: "Outlook not syncing on my iPhone", description: "Mail stopped arriving on my phone yesterday afternoon. Laptop Outlook is fine.",
    cat: 4, priority: "Normal", status: "Open", requester: 1001, assignee: 1002, created: hoursAgo(30), claimed: hoursAgo(29), impact: "slows_me_down" },
  { id: 1031, title: "Dock not detecting second screen", description: "Only the laptop screen works when docked; the second monitor says no signal.",
    cat: 1, priority: "Low", status: "Waiting on employee", requester: 1021, assignee: 1002, created: hoursAgo(48), claimed: hoursAgo(47), waiting: hoursAgo(46), impact: "slows_me_down" },
  { id: 1033, title: "Sage server down for the Durban branch", description: "Nobody in the Durban branch can open Sage. Month-end invoicing has stopped.",
    cat: 4, priority: "Urgent", status: "Open", requester: 1016, assignee: 1010, created: minsAgo(200), claimed: minsAgo(195), impact: "blocks_me" },
  { id: 1036, title: "Power BI Pro licence", description: "I need Power BI Pro to share the fleet dashboard with the regional managers.",
    cat: 7, priority: "Normal", status: "Open", requester: 1004, assignee: 1010, created: hoursAgo(20), approved: { by: 1003, at: hoursAgo(19.5) }, claimed: hoursAgo(19), impact: "slows_me_down",
    extra: { software_name: "Power BI Pro", cost_per_year: 2400, reason: "Share the fleet dashboard with the regional managers.", needed_by: "2026-11-20" } },

  // ----- IT Support: waiting for the lead's approval (S6, Sprint 2) -----
  { id: 1052, title: "Adobe Acrobat Pro licence", description: "I edit and sign supplier contracts every day.",
    cat: 7, priority: "Normal", status: "Pending approval", requester: 1004, created: hoursAgo(2), impact: "slows_me_down",
    extra: { software_name: "Adobe Acrobat Pro (annual)", cost_per_year: 3960, reason: "I edit and sign supplier contracts every day. The free reader can't edit or combine PDFs, so I print, sign and scan, which takes about an hour a day.", needed_by: "2026-11-20" } },
  { id: 1047, title: "New laptop for Sizwe Ndlovu", description: "Standard staff laptop for our new HR starter.",
    cat: 6, priority: "Normal", status: "Pending approval", requester: 1012, created: hoursAgo(5), impact: "minor",
    extra: { item: "Dell Latitude 5450 (standard staff laptop)", estimated_cost: 18500, reason: "Sizwe Ndlovu starts in HR on 17 November." } },
  { id: 1040, title: "Access to the Finance reporting folder", description: "I need read access to the reporting folder for month-end.",
    cat: 8, priority: "Low", status: "Pending approval", requester: 1001, created: hoursAgo(24), impact: "slows_me_down",
    extra: { system: "\\\\finance\\reporting", reason: "Month-end reporting pack." } },

  // ----- IT Support: finished -----
  { id: 1048, title: "VPN drops every 10 minutes on home fibre", description: "Since Monday my VPN (FortiClient) disconnects roughly every 10 minutes when I work from home in Midrand. Office Wi-Fi is fine. Month-end close is Friday, so this is urgent for me.",
    cat: 2, priority: "High", status: "Closed", requester: 1001, assignee: 1002, created: sast("08:14"), impact: "blocks_me",
    resolved: sast("13:55"), resolutionNote: "Router firmware updated, TCP profile set as default.", closed: sast("14:30") },
  { id: 1029, title: "Docking station replacement", description: "My dock stopped charging the laptop.",
    cat: 1, priority: "Normal", status: "Resolved", requester: 1001, assignee: 1010, created: hoursAgo(72), claimed: hoursAgo(71), impact: "slows_me_down",
    resolved: hoursAgo(50), resolutionNote: "Swapped the dock for a new Dell WD19S. Both screens tested at your desk." },
  { id: 1032, title: "Excel crashes when opening macros", description: "Excel closes as soon as I open the fuel cost workbook with macros.",
    cat: 4, priority: "High", status: "Resolved", requester: 1020, assignee: 1002, created: hoursAgo(7), claimed: minsAgo(400), impact: "blocks_me",
    resolved: hoursAgo(3), resolutionNote: "Repaired the Office install and re-trusted the macro location." },
  { id: 1030, title: "Projector HDMI not detected in Boardroom 1", description: "Laptops don't show on the projector in Boardroom 1.",
    cat: 1, priority: "Normal", status: "Closed", requester: 1017, assignee: 1002, created: hoursAgo(100), claimed: hoursAgo(99), impact: "slows_me_down",
    resolved: hoursAgo(70), resolutionNote: "Replaced the HDMI cable in the floor box.", closed: hoursAgo(68) }, // resolved late: breached
  { id: 1027, title: "Shared mailbox for Durban dispatch", description: "Please create dispatch.durban@ for the dispatch team.",
    cat: 9, priority: "Low", status: "Closed", requester: 1004, assignee: 1002, created: hoursAgo(120), claimed: hoursAgo(119), impact: "minor",
    resolved: hoursAgo(100), resolutionNote: "Mailbox created and the five dispatchers added.", closed: hoursAgo(96) },

  // ----- Human Resources (private to HR: Thabo gets 404) -----
  { id: 1053, title: "October payslip is missing my travel allowance", description: "The R1 200 travel allowance isn't on my October payslip.",
    cat: 10, priority: "Normal", status: "New", requester: 1001, created: minsAgo(210), impact: "minor", extra: { payslip_month: "October 2026" } },
  { id: 1049, title: "Employment letter for bond application", description: "The bank needs a letter confirming my salary and start date.",
    cat: 11, priority: "Low", status: "Open", requester: 1020, assignee: 1013, created: hoursAgo(20), claimed: hoursAgo(18), impact: "minor",
    extra: { purpose: "Home loan application at FNB" } },
  { id: 1034, title: "Leave balance looks wrong", description: "My leave balance dropped by 5 days but I only took 2 in October.",
    cat: 12, priority: "Normal", status: "Waiting on employee", requester: 1023, assignee: 1013, created: hoursAgo(6), claimed: hoursAgo(5), waiting: hoursAgo(4), impact: "minor" },

  // ----- Facilities -----
  { id: 1051, title: "Parking bay at Rosebank", description: "I need a parking bay from 1 December.",
    cat: 14, priority: "Low", status: "New", requester: 1001, created: hoursAgo(7), impact: "minor", extra: { location: "Rosebank" } },
  { id: 1038, title: "Broken chair on the 2nd floor", description: "The gas lift on my chair is gone; it sinks to the floor.",
    cat: 13, priority: "Normal", status: "Open", requester: 1021, assignee: 1015, created: hoursAgo(9), claimed: hoursAgo(8), impact: "slows_me_down",
    extra: { location: "Rosebank, 2nd floor" } },

  // ----- Finance -----
  { id: 1028, title: "Bidvest invoice not paid", description: "Bidvest says invoice INV-88213 from September is still unpaid.",
    cat: 16, priority: "Normal", status: "New", requester: 1022, created: hoursAgo(2), impact: "minor", extra: { invoice_number: "INV-88213", supplier: "Bidvest" } },
  { id: 1042, title: "Claim for toll fees, Durban trip", description: "Toll receipts attached for the 4 Nov Durban trip.",
    cat: 15, priority: "Low", status: "Cancelled", requester: 1020, created: hoursAgo(96), cancelled: hoursAgo(95), impact: "minor",
    extra: { amount: 486, expense_date: "2026-11-04" } },
];

type Cm = { ticket: number; author: number; body: string; internal?: boolean; at: Date };

const comments: Cm[] = [
  // HD-1048, page 5
  { ticket: 1048, author: 1002, body: "Same pattern as HD-0987, Vumatel CGNAT. @Sipho can you confirm the fix?", internal: true, at: sast("08:40") },
  { ticket: 1048, author: 1002, body: "Hi Lerato, thanks for the detail. Please switch to the \"Johannesburg-TCP\" profile in FortiClient and send me a screenshot of the result.", at: sast("09:02") },
  { ticket: 1048, author: 1001, body: "Done, screenshot attached. The TCP profile has held for 40 minutes so far!", at: sast("11:40") },
  // Other tickets
  { ticket: 1045, author: 1002, body: "Hi Johan, Sage keeps its own copy of your password. I'm resetting it in Sage Admin now.", at: minsAgo(160) },
  { ticket: 1045, author: 1002, body: "Sage keeps its own copy of the password. Asking Megan to reset it in Sage Admin.", internal: true, at: minsAgo(158) },
  { ticket: 1041, author: 1002, body: "Hi Lerato, please remove and re-add the account in the iOS Mail settings, then let me know.", at: hoursAgo(28.5) },
  { ticket: 1031, author: 1002, body: "Hi Pieter, which dock model is it? The label is underneath.", at: hoursAgo(46) },
  { ticket: 1033, author: 1010, body: "We're on it: the Durban Sage service stopped after last night's patch. Restarting it now.", at: minsAgo(190) },
  { ticket: 1036, author: 1010, body: "Approved by Thandi. Buying the licence through the Microsoft portal today.", at: hoursAgo(18.5) },
  { ticket: 1029, author: 1010, body: "Hi Lerato, I have a spare dock in the store room. I'll bring it to your desk in the morning.", at: hoursAgo(70.5) },
  { ticket: 1029, author: 1010, body: "Swapped your dock for a new Dell WD19S. Both screens tested at your desk.", at: hoursAgo(50) },
  { ticket: 1029, author: 1010, body: "Collecting the old dock for e-waste on Friday.", internal: true, at: hoursAgo(49.5) },
  { ticket: 1032, author: 1002, body: "Hi Johan, I'm repairing Office remotely. It will restart once.", at: minsAgo(395) },
  { ticket: 1030, author: 1002, body: "Floor box cable looks damaged. Ordering a new one.", at: hoursAgo(98) },
  { ticket: 1027, author: 1002, body: "Hi Ayesha, who should have access to the new mailbox?", at: hoursAgo(118) },
  { ticket: 1027, author: 1004, body: "The five dispatchers in Durban, please.", at: hoursAgo(110) },
  { ticket: 1027, author: 1002, body: "Mailbox created. All five dispatchers can see it in Outlook now.", at: hoursAgo(100) },
  { ticket: 1049, author: 1013, body: "Hi Johan, the letter will be ready tomorrow. Which branch is the bank?", at: hoursAgo(17.5) },
  { ticket: 1034, author: 1013, body: "Hi Sizwe, did you also take a half day on 3 November? Please confirm.", at: hoursAgo(4) },
  { ticket: 1038, author: 1015, body: "A new chair is on its way from the Midrand store.", at: hoursAgo(7.5) },
];

type Ev = { ticket: number; actor: number | null; type: string; from?: string | null; to?: string | null; note?: string | null; internal?: boolean; at: Date };

// HD-1048, every step from page 5, in order
const hd1048Events: Ev[] = [
  { ticket: 1048, actor: 1001, type: "created", to: "New", at: sast("08:14") },
  { ticket: 1048, actor: 1002, type: "priority_changed", from: "Normal", to: "High", at: sast("08:31") },
  { ticket: 1048, actor: 1002, type: "claimed", to: "1002", at: sast("08:31") },
  { ticket: 1048, actor: 1002, type: "status_changed", from: "New", to: "Open", at: sast("08:31") },
  { ticket: 1048, actor: 1002, type: "status_changed", from: "Open", to: "Waiting on employee", at: sast("09:02") },
  { ticket: 1048, actor: 1001, type: "status_changed", from: "Waiting on employee", to: "Open", note: "Lerato replied", at: sast("11:40") },
  { ticket: 1048, actor: 1002, type: "status_changed", from: "Open", to: "Resolved", note: "Router firmware updated, TCP profile set as default.", at: sast("13:55") },
  { ticket: 1048, actor: 1001, type: "status_changed", from: "Resolved", to: "Closed", note: "Yes, it's fixed", at: sast("14:30") },
];

const categoryById = new Map(categories.map((c) => [c.id, c]));

/** A plausible history for every other ticket, matching its status and timestamps */
function eventsFor(t: T): Ev[] {
  if (t.id === 1048) return hd1048Events;
  const cat = categoryById.get(t.cat)!;
  const events: Ev[] = [];
  const firstStatus: Status = cat.approval ? "Pending approval" : "New";
  events.push({ ticket: t.id, actor: t.requester, type: "created", to: firstStatus, at: t.created });

  if (t.approved) {
    events.push({ ticket: t.id, actor: t.approved.by, type: "approved", from: "Pending approval", to: "New", at: t.approved.at });
    events.push({ ticket: t.id, actor: t.approved.by, type: "status_changed", from: "Pending approval", to: "New", at: t.approved.at });
  }
  if (t.assignee) {
    const at = t.claimed ?? after(t.created, 15);
    events.push({ ticket: t.id, actor: t.assignee, type: "claimed", to: String(t.assignee), at });
    events.push({ ticket: t.id, actor: t.assignee, type: "status_changed", from: "New", to: "Open", at });
  }
  if (t.waiting) {
    events.push({ ticket: t.id, actor: t.assignee ?? null, type: "status_changed", from: "Open", to: "Waiting on employee", at: t.waiting });
  }
  if (t.resolved) {
    events.push({ ticket: t.id, actor: t.assignee ?? null, type: "status_changed", from: "Open", to: "Resolved", note: t.resolutionNote ?? null, at: t.resolved });
  }
  if (t.closed) {
    events.push({ ticket: t.id, actor: t.requester, type: "status_changed", from: "Resolved", to: "Closed", note: "Yes, it's fixed", at: t.closed });
  }
  if (t.cancelled) {
    events.push({ ticket: t.id, actor: t.requester, type: "status_changed", from: firstStatus, to: "Cancelled", note: "Withdrawn by the employee", at: t.cancelled });
  }
  return events;
}

const feedback = [
  { ticket: 1048, user: 1001, rating: 5, comment: "Fixed the same day, thanks Thabo!", at: sast("14:30") },
  { ticket: 1027, user: 1004, rating: 5, comment: "Sorted the same day, thanks!", at: hoursAgo(96) },
];

// ---------- seed ----------

async function seed(c: PoolClient) {
  await c.query(
    `TRUNCATE ticket_event, ticket_feedback, internal_note, comment, ticket, request_type, category, sla_policy, users, department
     RESTART IDENTITY CASCADE`
  );

  for (const d of departments) {
    await c.query(`INSERT INTO department (department_id, department_name, description) VALUES ($1, $2, $3)`, [d.id, d.name, d.description]);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of users) {
    await c.query(
      `INSERT INTO users (user_id, name, surname, email, password, role, active, department_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [u.id, u.name, u.surname, `${u.email}@mzansifreight.co.za`, hash, u.role, u.active ?? true, u.dept],
    );
  }

  for (const [dept, lead] of Object.entries(leads)) {
    await c.query(`UPDATE department SET lead_id = $1 WHERE department_id = $2`, [lead, Number(dept)]);
  }

  for (const p of slaPolicies) {
    await c.query(`INSERT INTO sla_policy (priority, first_response_mins, resolution_mins) VALUES ($1, $2, $3)`, [p.priority, p.first, p.resolution]);
  }

  for (const cat of categories) {
    const approval = cat.approval ?? false;
    await c.query(
      `INSERT INTO category (category_id, department_id, category_name, kind, icon, description, default_priority, needs_approval, fields, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cat.id, cat.dept, cat.name, cat.kind, cat.icon, cat.description, cat.priority ?? "Normal", approval,
       JSON.stringify(cat.fields ?? []), !approval],
    );
  }

  for (const r of requestTypes) {
    await c.query(
      `INSERT INTO request_type (request_type_id, department_id, request_type_name, kind, extra_fields) VALUES ($1,$2,$3,$4,$5)`,
      [r.id, r.dept, r.name, r.kind, r.extra],
    );
  }

  for (const t of tickets) {
    const cat = categoryById.get(t.cat)!;
    const lastChange = t.closed ?? t.cancelled ?? t.resolved ?? t.waiting ?? t.claimed ?? t.created;
    await c.query(
      `INSERT INTO ticket (ticket_id, title, description, ticket_department_id, ticket_category_id, ticket_priority, ticket_status,
                           impact, extra_fields, requester_id, assignee_id, created_at, updated_at,
                           resolved_at, closed_at, resolution_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [t.id, t.title, t.description, cat.dept, t.cat, t.priority, t.status,
       t.impact ?? null, JSON.stringify(t.extra ?? {}), t.requester, t.assignee ?? null, t.created, lastChange,
       t.resolved ?? null, t.closed ?? null, t.resolutionNote ?? null],
    );
  }

  // Due times straight from sla_policy, counted from created_at. Pending approval has no clock yet.
  await c.query(
    `UPDATE ticket t
     SET first_response_due_at = t.created_at + make_interval(mins => p.first_response_mins),
         resolution_due_at     = t.created_at + make_interval(mins => p.resolution_mins)
     FROM sla_policy p
     WHERE p.priority = t.ticket_priority AND t.ticket_status <> 'Pending approval'`,
  );

  for (const cm of comments) {
    await c.query(
      `INSERT INTO comment (ticket_id, author_id, body, is_internal, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [cm.ticket, cm.author, cm.body, cm.internal ?? false, cm.at],
    );
  }

  // The first public staff reply stops the first-response clock (internal notes don't)
  await c.query(
    `UPDATE ticket t
     SET first_response_at = r.first_at
     FROM (
       SELECT c.ticket_id, MIN(c.created_at) AS first_at
       FROM comment c
       JOIN ticket tk ON tk.ticket_id = c.ticket_id
       JOIN users u ON u.user_id = c.author_id
       WHERE NOT c.is_internal AND u.role IN ('Agent', 'Department Lead') AND c.author_id <> tk.requester_id
       GROUP BY c.ticket_id
     ) r
     WHERE r.ticket_id = t.ticket_id`,
  );

  let eventCount = 0;
  for (const t of tickets) {
    for (const e of eventsFor(t)) {
      await c.query(
        `INSERT INTO ticket_event (ticket_id, actor_id, type, from_value, to_value, note, is_internal, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [e.ticket, e.actor, e.type, e.from ?? null, e.to ?? null, e.note ?? null, e.internal ?? false, e.at],
      );
      eventCount++;
    }
  }

  for (const f of feedback) {
    await c.query(
      `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [f.ticket, f.user, f.rating, f.comment, f.at],
    );
  }

  // We inserted fixed ids, so move each id counter past them for new rows. The next ticket is HD-1054.
  for (const [table, col] of [["department", "department_id"], ["category", "category_id"], ["request_type", "request_type_id"], ["ticket", "ticket_id"]]) {
    await c.query(`SELECT setval(pg_get_serial_sequence('${table}', '${col}'), (SELECT MAX(${col}) FROM ${table}))`);
  }

  return eventCount;
}

export async function runSeed(): Promise<void> {
  assertLocalDb("seed the database");
  const pool = new Pool(dbConfig());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const events = await seed(client);
    await client.query("COMMIT");
    console.log(
      `Seeded ${departments.length} departments, ${users.length} users, ${categories.length} categories, ` +
        `${slaPolicies.length} SLA policies, ${tickets.length} tickets, ${comments.length} comments, ${events} events, ` +
        `${feedback.length} ratings.`,
    );
    console.log(`Every login uses the password ${DEMO_PASSWORD}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runSeed().catch((error) => {
    console.error("Seed failed:", error.message);
    process.exit(1);
  });
}
