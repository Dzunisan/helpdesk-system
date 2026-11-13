// Fills the database with the Mzansi Freight demo data from the team briefing.
// WARNING: wipes every table first, so it only runs when DB_HOST is localhost/127.0.0.1.
// Run:  npm run db:seed   (or npm run db:reset to rebuild the schema and seed in one go)
//
// Sprint 1 shape (db/migrations/001_lifecycle.sql): seven statuses, Urgent/High/Normal/Low, SLA due
// times from sla_policy, categories that route to a department, and a ticket_event history for every
// ticket. HD-1048 replays the worked example on briefing page 5 (Tuesday 10 November). The highest
// seeded reference is HD-1053, so the first request made in the demo is HD-1054 (pages 14 and 28).
//
// Sprint 2 (db/migrations/003_sprint2.sql, briefing p.30 "Seed for the demo"):
//   - approval categories are ACTIVE (S6); Ayesha's Adobe licence (HD-1052), Nomvula's laptop for
//     Sizwe (HD-1047) and Pieter's Finance folder access (HD-1040) wait in Pending approval: Approvals (3)
//   - 6 IT and 3 HR macros with usage counts (S7, p.16 / p.58)
//   - Zanele's "Aircon dripping onto my desk" (HD-1037) is misfiled in IT (S12)
//   - HD-1050 is just past its first-response time and NOT yet alerted, so "Run jobs now" raises one
//     sla_breached notification for Thandi; every other breached live ticket was already alerted (S9)
//   - HD-1001..HD-1026: 30 days of closed tickets with ratings (two 2-star IT comments last week), so
//     CSAT and the dashboard aren't empty (S8, S10); HD-1026 is a rejected approval for the History tab
//   - a few notifications (read and unread) and their outbox rows (S9)
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
/** invited: created by an admin and never signed in, so the Users table shows "Invited" (S1) */
type U = { id: number; name: string; surname: string; email: string; role: Role; dept: number | null; active?: boolean; invited?: boolean };

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
  { id: 1014, name: "Kagiso", surname: "Molefe", email: "kagiso", role: "Agent", dept: 3 },
  // Facilities lead: the S12 move lands in his department and he is notified (p.30 step 8)
  { id: 1015, name: "Bongani", surname: "Zulu", email: "bongani", role: "Department Lead", dept: 3 },
  { id: 1016, name: "Bongani", surname: "Mabaso", email: "bongani.mabaso", role: "Department Lead", dept: 4 },
  { id: 1017, name: "Fatima", surname: "Ismail", email: "fatima", role: "Agent", dept: 4 },
  { id: 1018, name: "Busisiwe", surname: "Mkhize", email: "busisiwe", role: "System Admin", dept: null },
  { id: 1019, name: "Karabo", surname: "Sello", email: "karabo", role: "Agent", dept: 2, invited: true },
  // Extra employees
  { id: 1020, name: "Johan", surname: "van Wyk", email: "johan", role: "Employee", dept: 4 },
  { id: 1021, name: "Pieter", surname: "Botha", email: "pieter", role: "Employee", dept: 3 },
  { id: 1022, name: "Zanele", surname: "Khumalo", email: "zanele", role: "Employee", dept: 3 },
  { id: 1023, name: "Sizwe", surname: "Ndlovu", email: "sizwe", role: "Employee", dept: 2 },
  { id: 1024, name: "Dawid", surname: "Pretorius", email: "dawid", role: "Employee", dept: 1, active: false },
];

const leads: Record<number, number> = { 1: 1003, 2: 1012, 3: 1015, 4: 1016 };

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
// Approval categories are active since Sprint 2 (S6 approvals): a request lands in Pending approval.
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
  /** Approval categories the lead turned down (status Cancelled, the reason is public) */
  rejected?: { by: number; at: Date; reason: string };
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
//   Unassigned IT queue: HD-1050 breached (the one rose row), the rest on track
//   Thabo's open work: HD-1041 breached, HD-1045 on track, HD-1031 waiting on the employee
// Every other live ticket has at least ~3.5 hours before a clock runs out, so a reset on the
// morning of the demo still shows exactly two breaches and one "Run jobs now" alert (p.30).
const tickets: T[] = [
  // ----- IT Support: unassigned queue (New) -----
  // Just past its 60-minute first response and not yet alerted: "Run jobs now" alerts Thandi (p.30)
  { id: 1050, title: "Laptop screen cracked after a fall", description: "Dropped my laptop at the Durban depot, the screen is cracked in the corner and half of it is black.",
    cat: 1, priority: "High", status: "New", requester: 1021, created: minsAgo(70), impact: "blocks_me" },
  { id: 1044, title: "3rd floor printer in Rosebank keeps jamming", description: "The HP on the 3rd floor jams on every second page. We have a board pack to print today.",
    cat: 5, priority: "Normal", status: "New", requester: 1022, created: minsAgo(25), impact: "slows_me_down" },
  { id: 1046, title: "New starter: laptop & accounts for Sizwe Ndlovu", description: "Sizwe starts in HR on 17 Nov and needs a laptop, email and VPN set up before then.",
    cat: 9, priority: "Normal", status: "New", requester: 1012, created: minsAgo(15), impact: "minor" },
  { id: 1043, title: "Teams camera not working in Boardroom 2", description: "The room camera shows a black screen in every Teams meeting since this morning.",
    cat: 4, priority: "Normal", status: "New", requester: 1017, created: minsAgo(15), impact: "slows_me_down" },
  { id: 1035, title: "Wi-Fi drops in the Durban office canteen", description: "Signal disappears near the canteen windows. Fine everywhere else in the building.",
    cat: 2, priority: "Low", status: "New", requester: 1004, created: hoursAgo(1), impact: "minor" },
  { id: 1039, title: "Monitor flickers when laptop is docked", description: "My second screen flickers every few seconds when the laptop is in the dock.",
    cat: 1, priority: "Low", status: "New", requester: 1022, created: minsAgo(90), impact: "slows_me_down" },
  { id: 1037, title: "Aircon dripping onto my desk", description: "Water is dripping from the aircon onto my desk on the 3rd floor in Rosebank. The carpet is soaked.",
    cat: 9, priority: "Normal", status: "New", requester: 1022, created: minsAgo(20), impact: "blocks_me" }, // misfiled in IT on purpose (S12 demo)

  // ----- IT Support: owned work -----
  { id: 1045, title: "Can't log in to Sage after password change", description: "Sage 300 says invalid credentials since I changed my Windows password this morning.",
    cat: 3, priority: "High", status: "Open", requester: 1020, assignee: 1002, created: hoursAgo(3), claimed: minsAgo(165), impact: "blocks_me" },
  { id: 1041, title: "Outlook not syncing on my iPhone", description: "Mail stopped arriving on my phone yesterday afternoon. Laptop Outlook is fine.",
    cat: 4, priority: "Normal", status: "Open", requester: 1001, assignee: 1002, created: hoursAgo(30), claimed: hoursAgo(29), impact: "slows_me_down" },
  { id: 1031, title: "Dock not detecting second screen", description: "Only the laptop screen works when docked; the second monitor says no signal.",
    cat: 1, priority: "Low", status: "Waiting on employee", requester: 1021, assignee: 1002, created: hoursAgo(48), claimed: hoursAgo(47), waiting: hoursAgo(46), impact: "slows_me_down" },
  { id: 1033, title: "Sage server down for the Durban branch", description: "Nobody in the Durban branch can open Sage. Month-end invoicing has stopped.",
    cat: 4, priority: "Urgent", status: "Open", requester: 1016, assignee: 1010, created: minsAgo(30), claimed: minsAgo(28), impact: "blocks_me" },
  { id: 1036, title: "Power BI Pro licence", description: "I need Power BI Pro to share the fleet dashboard with the regional managers.",
    cat: 7, priority: "Normal", status: "Open", requester: 1004, assignee: 1010, created: hoursAgo(16), approved: { by: 1003, at: hoursAgo(15.5) }, claimed: hoursAgo(15), impact: "slows_me_down",
    extra: { software_name: "Power BI Pro", cost_per_year: 2400, reason: "Share the fleet dashboard with the regional managers.", needed_by: "2026-11-20" } },

  // ----- IT Support: waiting for the lead's approval (S6, Sprint 2) -----
  { id: 1052, title: "Adobe Acrobat Pro licence", description: "I edit and sign supplier contracts every day.",
    cat: 7, priority: "Normal", status: "Pending approval", requester: 1004, created: hoursAgo(2), impact: "slows_me_down",
    extra: { software_name: "Adobe Acrobat Pro (annual)", cost_per_year: 3960, reason: "I edit and sign supplier contracts every day. The free reader can't edit or combine PDFs, so I print, sign and scan, which takes about an hour a day.", needed_by: "2026-11-20" } },
  { id: 1047, title: "New laptop for Sizwe Ndlovu", description: "Standard staff laptop for our new HR starter.",
    cat: 6, priority: "Normal", status: "Pending approval", requester: 1012, created: hoursAgo(5), impact: "minor",
    extra: { item: "Dell Latitude 5450 (standard staff laptop)", estimated_cost: 18500, reason: "Sizwe Ndlovu starts in HR on 17 November." } },
  { id: 1040, title: "Access to the Finance reporting folder", description: "I need read access to the Finance reporting folder to pull the fleet cost reports for month-end.",
    cat: 8, priority: "Low", status: "Pending approval", requester: 1021, created: hoursAgo(24), impact: "slows_me_down",
    extra: { system: "\\\\finance\\reporting", reason: "Facilities pays the fleet fuel and repair invoices; I need the monthly cost reports for the month-end pack." } },

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
    cat: 10, priority: "Normal", status: "New", requester: 1001, created: minsAgo(20), impact: "minor", extra: { payslip_month: "October 2026" } },
  { id: 1049, title: "Employment letter for bond application", description: "The bank needs a letter confirming my salary and start date.",
    cat: 11, priority: "Low", status: "Open", requester: 1020, assignee: 1013, created: hoursAgo(20), claimed: hoursAgo(18), impact: "minor",
    extra: { purpose: "Home loan application at FNB" } },
  { id: 1034, title: "Leave balance looks wrong", description: "My leave balance dropped by 5 days but I only took 2 in October.",
    cat: 12, priority: "Normal", status: "Waiting on employee", requester: 1023, assignee: 1013, created: hoursAgo(6), claimed: hoursAgo(5), waiting: hoursAgo(4), impact: "minor" },

  // ----- Facilities -----
  { id: 1051, title: "Parking bay at Rosebank", description: "I need a parking bay from 1 December.",
    cat: 14, priority: "Low", status: "New", requester: 1001, created: hoursAgo(1), impact: "minor", extra: { location: "Rosebank" } },
  { id: 1038, title: "Broken chair on the 2nd floor", description: "The gas lift on my chair is gone; it sinks to the floor.",
    cat: 13, priority: "Normal", status: "Open", requester: 1021, assignee: 1014, created: hoursAgo(9), claimed: hoursAgo(8), impact: "slows_me_down",
    extra: { location: "Rosebank, 2nd floor" } },

  // ----- Finance -----
  { id: 1028, title: "Bidvest invoice not paid", description: "Bidvest says invoice INV-88213 from September is still unpaid.",
    cat: 16, priority: "Normal", status: "New", requester: 1022, created: minsAgo(30), impact: "minor", extra: { invoice_number: "INV-88213", supplier: "Bidvest" } },
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
  { ticket: 1033, author: 1010, body: "We're on it: the Durban Sage service stopped after last night's patch. Restarting it now.", at: minsAgo(25) },
  { ticket: 1036, author: 1010, body: "Approved by Thandi. Buying the licence through the Microsoft portal today.", at: hoursAgo(14.5) },
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
  { ticket: 1038, author: 1014, body: "A new chair is on its way from the Midrand store.", at: hoursAgo(7.5) },
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
  if (t.rejected) {
    events.push({ ticket: t.id, actor: t.rejected.by, type: "rejected", from: "Pending approval", to: "Cancelled", note: t.rejected.reason, at: t.rejected.at });
  }
  if (t.cancelled) {
    events.push({ ticket: t.id, actor: t.requester, type: "status_changed", from: firstStatus, to: "Cancelled", note: "Withdrawn by the employee", at: t.cancelled });
  }
  return events;
}

type Fb = { ticket: number; user: number; rating: number; comment: string | null; tags?: string[]; at: Date };

const feedback: Fb[] = [
  { ticket: 1048, user: 1001, rating: 5, comment: "Fixed the same day, thanks Thabo!", tags: ["Fast reply", "Fixed first time"], at: sast("14:30") },
  { ticket: 1027, user: 1004, rating: 5, comment: "Sorted the same day, thanks!", tags: ["Fast reply"], at: hoursAgo(96) },
];

// ---------- Sprint 2: 30 days of history (HD-1001..HD-1026) ----------

const DAY = 24 * 60;
const daysAgo = (days: number, hour = 9) => {
  // A working-hours time `days` ago, in SAST
  const d = new Date(Date.now() - days * DAY * MIN);
  const sastDate = new Date(d.getTime() + 2 * 60 * MIN).toISOString().slice(0, 10);
  return new Date(`${sastDate}T${String(hour).padStart(2, "0")}:15:00+02:00`);
};

/**
 * Closed, rated tickets: [id, title, category, priority, requester, agent, days ago, hours to fix,
 * rating, comment, tags]. Agents: Thabo 1002, Sipho 1010, Megan 1011 (IT), Priya 1013 (HR).
 */
type H = [number, string, number, Priority, number, number, number, number, number, string | null, string[]];
const history: H[] = [
  [1001, "Laptop won't charge", 1, "Normal", 1020, 1010, 29, 5, 5, "New charger the same afternoon.", ["Fast reply", "Fixed first time"]],
  [1002, "Can't connect to the office Wi-Fi", 2, "Normal", 1022, 1002, 28, 2, 5, null, ["Fast reply"]],
  [1003, "Locked out after too many attempts", 3, "High", 1004, 1011, 27, 1, 5, "Back in within the hour.", ["Fast reply", "Friendly"]],
  [1004, "Payslip shows the wrong tax number", 10, "Normal", 1001, 1013, 26, 20, 4, null, ["Kept me updated"]],
  [1005, "Teams keeps signing me out", 4, "Normal", 1021, 1002, 25, 6, 5, null, ["Fixed first time"]],
  [1006, "Printer on 2nd floor offline", 5, "Normal", 1017, 1010, 23, 3, 4, null, []],
  [1007, "VPN slow from the Durban depot", 2, "High", 1020, 1002, 22, 7, 5, "Thabo explained exactly what changed.", ["Kept me updated", "Friendly"]],
  [1008, "Employment letter for a visa", 11, "Low", 1022, 1013, 21, 26, 5, "Letter was perfect, thank you.", ["Friendly"]],
  [1009, "MFA codes not arriving", 3, "High", 1001, 1011, 20, 2, 5, null, ["Fast reply"]],
  [1010, "Excel add-in missing after update", 4, "Normal", 1004, 1010, 18, 9, 4, null, ["Fixed first time"]],
  [1011, "Keyboard keys sticking", 1, "Low", 1023, 1011, 17, 30, 4, "Took a while to get a replacement, but it works well now.", ["Kept me updated"]],
  [1012, "Leave days not updated after cancelling leave", 12, "Normal", 1020, 1013, 15, 22, 5, null, ["Kept me updated"]],
  [1013, "Shared drive mapping lost", 9, "Normal", 1021, 1002, 14, 4, 5, null, ["Fast reply", "Fixed first time"]],
  [1014, "Second screen upside down", 1, "Low", 1022, 1010, 13, 3, 5, "Quick and friendly.", ["Friendly"]],
  [1015, "Outlook search not finding old mail", 4, "Normal", 1001, 1002, 11, 8, 4, null, []],
  [1016, "Password reset for Sage", 3, "High", 1020, 1011, 10, 1, 5, null, ["Fast reply"]],
  [1017, "Payroll query: overtime missing", 10, "Normal", 1021, 1013, 9, 30, 4, null, ["Kept me updated"]],
  [1018, "Wi-Fi drops in Boardroom 1", 2, "Normal", 1017, 1010, 8, 6, 5, null, ["Fixed first time"]],
  // Last week's two low scores (p.19: "Thandi reads the two 2-star comments from last week")
  [1019, "Laptop very slow after the update", 1, "Normal", 1004, 1011, 6, 50, 2, "Took three days and I had to chase twice.", []],
  [1020, "Scanner not sending to email", 5, "Normal", 1022, 1010, 5, 28, 2, "Fixed, but nobody told me it was done.", []],
  [1021, "Can't open PDF attachments", 4, "Normal", 1023, 1002, 4, 3, 5, "Sorted in a morning.", ["Fast reply", "Fixed first time"]],
  [1022, "New mouse please", 1, "Low", 1001, 1011, 3, 4, 5, null, ["Fast reply"]],
  [1023, "Leave form won't submit", 12, "Normal", 1004, 1013, 3, 6, 5, null, ["Fast reply"]],
  [1024, "Calendar not syncing to my phone", 4, "Normal", 1020, 1002, 2, 5, 4, null, ["Kept me updated"]],
  [1025, "Teams audio crackles", 4, "Normal", 1021, 1010, 2, 4, 5, null, []],
];

const historyReplies = [
  "Hi {name}, I'm on it and will update you shortly.",
  "Hi {name}, thanks for the detail. I'll come to your desk in 20 minutes.",
  "Hi {name}, I've found the cause and I'm fixing it now.",
];

const firstName = (id: number) => users.find((u) => u.id === id)!.name;

for (const [id, title, cat, priority, requester, agent, days, hoursToFix, rating, comment, tags] of history) {
  const created = daysAgo(days, 8 + (id % 4));
  const claimed = after(created, 20);
  const resolved = after(created, hoursToFix * 60);
  const closed = after(resolved, rating <= 2 ? 3 * 60 : 60);
  tickets.push({
    id, title, description: `${title}.`, cat, priority, status: "Closed", requester, assignee: agent,
    created, claimed, resolved, resolutionNote: "Fixed and tested with the employee.", closed, impact: "slows_me_down",
  });
  comments.push({ ticket: id, author: agent, body: historyReplies[id % historyReplies.length].replace("{name}", firstName(requester)), at: after(claimed, 10) });
  feedback.push({ ticket: id, user: requester, rating, comment, tags, at: after(closed, 5) });
}

// A rejected approval for the lead's History tab (S6)
tickets.push({
  id: 1026, title: "Second monitor for my home office", description: "A second 27-inch screen for working from home.",
  cat: 6, priority: "Normal", status: "Cancelled", requester: 1020, created: daysAgo(12, 10), impact: "minor",
  rejected: { by: 1003, at: daysAgo(12, 14), reason: "Home office screens aren't covered by the IT budget this year. Please use the hot desks in Midrand, which have two screens." },
  extra: { item: "Dell 27-inch monitor", estimated_cost: 4200, reason: "Working from home three days a week." },
});

// ---------- Sprint 2: macros (S7, p.16 / p.58) ----------

type Macro = { dept: number; title: string; body: string; set: Status | null; uses: number; by: number };
const macros: Macro[] = [
  { dept: 1, by: 1003, uses: 41, set: "Waiting on employee", title: "VPN: switch to TCP profile",
    body: "Hi {{requester.first_name}},\n\nThanks for reporting this. Home fibre routers sometimes drop VPN traffic. Please open FortiClient, choose the Johannesburg-TCP profile and reconnect. If it still drops, reply with a screenshot of the VPN check tool and I'll dig deeper.\n\nReference: {{ticket.ref}}\n{{agent.first_name}}, IT Support" },
  { dept: 1, by: 1003, uses: 18, set: "Waiting on employee", title: "Sage: password re-sync steps",
    body: "Hi {{requester.first_name}},\n\nSage keeps its own copy of your password. Please sign out of Sage, sign in to Windows with your new password, then open Sage and choose \"Use my Windows password\". Let me know if it still says invalid credentials.\n\n{{agent.first_name}}, IT Support" },
  { dept: 1, by: 1003, uses: 63, set: null, title: "Password reset: self-service link",
    body: "Hi {{requester.first_name}},\n\nYou can reset your password yourself at https://passwordreset.microsoftonline.com with your work email and the code sent to your phone. It takes about two minutes.\n\n{{agent.first_name}}, IT Support" },
  { dept: 1, by: 1003, uses: 12, set: "Waiting on employee", title: "Laptop on order",
    body: "Hi {{requester.first_name}},\n\nYour replacement laptop is on order and should arrive within 3 working days. I'll set it up and let you know when it's ready to collect.\n\nReference: {{ticket.ref}}\n{{agent.first_name}}, IT Support" },
  { dept: 1, by: 1003, uses: 88, set: "Resolved", title: "Resolved: please confirm",
    body: "Hi {{requester.first_name}},\n\nThis should be fixed now. Please check and click \"Yes, it's fixed\" on your request, or \"Still broken\" if it isn't.\n\n{{agent.first_name}}, IT Support" },
  { dept: 1, by: 1003, uses: 9, set: "Waiting on employee", title: "Printer: clear a paper jam",
    body: "Hi {{requester.first_name}},\n\nPlease open the front panel, pull the jammed sheet out gently towards you and close the panel. If the printer still shows a jam, reply here and I'll come past.\n\n{{agent.first_name}}, IT Support" },
  { dept: 2, by: 1012, uses: 22, set: "Waiting on employee", title: "Payslip: send the month and the line",
    body: "Hi {{requester.first_name}},\n\nThanks for flagging this. Please reply with the payslip month and the line that looks wrong, and we'll check it against your contract.\n\n{{agent.first_name}}, Human Resources" },
  { dept: 2, by: 1012, uses: 15, set: "Resolved", title: "Employment letter ready",
    body: "Hi {{requester.first_name}},\n\nYour employment letter is ready. Collect the signed copy at HR reception or reply here and we'll email the PDF.\n\nReference: {{ticket.ref}}\n{{agent.first_name}}, Human Resources" },
  { dept: 2, by: 1012, uses: 7, set: null, title: "Leave balance explained",
    body: "Hi {{requester.first_name}},\n\nYour leave balance updates on the last working day of the month. Leave you cancel is added back in the next run. If it still looks wrong after that, reply here.\n\n{{agent.first_name}}, Human Resources" },
];

// ---------- seed ----------

async function seed(c: PoolClient) {
  // p.30 step 10: HD-1050's alert waits for "Run jobs now" (see migrations/006_app_setting.sql)
  await c.query(`DELETE FROM app_setting WHERE key = 'hold_breach_alerts_for_demo'`);
  await c.query(`INSERT INTO app_setting (key, value) VALUES ('hold_breach_alerts_for_demo', 'true'::jsonb)`);

  await c.query(
    `TRUNCATE attachment_blob, attachment, outbox, notification, notification_pref, canned_response, ticket_approval,
              ticket_event, ticket_feedback, internal_note, comment, ticket, request_type, category, sla_policy, users, department
     RESTART IDENTITY CASCADE`
  );

  for (const d of departments) {
    await c.query(`INSERT INTO department (department_id, department_name, description) VALUES ($1, $2, $3)`, [d.id, d.name, d.description]);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of users) {
    await c.query(
      `INSERT INTO users (user_id, name, surname, email, password, role, active, department_id, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [u.id, u.name, u.surname, `${u.email}@mzansifreight.co.za`, hash, u.role, u.active ?? true, u.dept, u.invited ?? false],
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
       JSON.stringify(cat.fields ?? []), true],
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
    const lastChange = t.closed ?? t.cancelled ?? t.rejected?.at ?? t.resolved ?? t.waiting ?? t.claimed ?? t.created;
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

  // S10: one rating per ticket, with the agent and department at closing time; the survey was sent at close
  for (const f of feedback) {
    await c.query(
      `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment, tags, agent_id, department_id, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, t.assignee_id, t.ticket_department_id, $6, $6 FROM ticket t WHERE t.ticket_id = $1`,
      [f.ticket, f.user, f.rating, f.comment, f.tags ?? [], f.at],
    );
    await c.query(
      `INSERT INTO ticket_event (ticket_id, actor_id, type, to_value, note, created_at) VALUES ($1, $2, 'feedback_given', $3, $4, $5)`,
      [f.ticket, f.user, String(f.rating), f.comment, f.at],
    );
  }
  await c.query(`UPDATE ticket SET csat_requested_at = closed_at WHERE ticket_status = 'Closed'`);

  // S6: one ticket_approval row per decision already made
  for (const t of tickets) {
    if (t.approved) {
      await c.query(`INSERT INTO ticket_approval (ticket_id, approver_id, decision, reason, decided_at) VALUES ($1, $2, 'approved', NULL, $3)`,
        [t.id, t.approved.by, t.approved.at]);
    }
    if (t.rejected) {
      await c.query(`INSERT INTO ticket_approval (ticket_id, approver_id, decision, reason, decided_at) VALUES ($1, $2, 'rejected', $3, $4)`,
        [t.id, t.rejected.by, t.rejected.reason, t.rejected.at]);
    }
  }

  // S7: macros
  for (const m of macros) {
    await c.query(
      `INSERT INTO canned_response (department_id, title, body, set_status, created_by, updated_by, use_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $7)`,
      [m.dept, m.title, m.body, m.set, m.by, m.uses, daysAgo(10)],
    );
  }

  // S9: every breached live ticket except HD-1050 already raised its one alert (to the lead and owner)
  const { rows: alerted } = await c.query(
    `UPDATE ticket t SET breach_notified_at = LEAST(t.first_response_due_at, t.resolution_due_at) + interval '5 minutes'
     WHERE t.ticket_status IN ('New', 'Open', 'Waiting on employee') AND t.ticket_id <> 1050
       AND ((t.first_response_at IS NULL AND t.first_response_due_at < now()) OR t.resolution_due_at < now())
     RETURNING t.ticket_id, t.title, t.assignee_id, t.ticket_department_id, t.breach_notified_at,
               (t.first_response_at IS NULL AND t.first_response_due_at < now()) AS first_breached`,
  );
  type N = { user: number | string; ticket: number | null; actor: number | null; type: string; title: string; body?: string | null; at: Date; read?: boolean };
  const notes: N[] = [];
  for (const a of alerted) {
    const what = `${a.first_breached ? "First response" : "Resolution"} breached on HD-${a.ticket_id}`;
    for (const who of [leads[a.ticket_department_id], a.assignee_id].filter(Boolean)) {
      notes.push({ user: who, ticket: a.ticket_id, actor: null, type: "sla_breached", title: what, body: a.title, at: a.breach_notified_at, read: true });
    }
  }
  notes.push(
    // Lerato: Thabo's reply on her Outlook ticket (unread: the red dot), Sipho resolved her dock
    { user: 1001, ticket: 1041, actor: 1002, type: "reply_added", title: "Thabo Nkosi replied on HD-1041", body: "Hi Lerato, please remove and re-add the account in the iOS Mail settings, then let me know.", at: hoursAgo(28.5) },
    { user: 1001, ticket: 1029, actor: 1010, type: "status_changed", title: "Sipho Mahlangu resolved HD-1029", body: "Swapped the dock for a new Dell WD19S. Both screens tested at your desk.", at: hoursAgo(50), read: true },
    // Thabo: Lerato's reply on HD-1048 (read)
    { user: 1002, ticket: 1048, actor: 1001, type: "reply_added", title: "Lerato Mokoena replied on HD-1048", body: "Done, screenshot attached. The TCP profile has held for 40 minutes so far!", at: sast("11:40"), read: true },
    // Thandi: the three requests waiting for her approval, and last week's low rating
    { user: 1003, ticket: 1040, actor: 1021, type: "approval_waiting", title: "Pieter Botha needs your approval on HD-1040", body: "Access to the Finance reporting folder", at: hoursAgo(24) },
    { user: 1003, ticket: 1047, actor: 1012, type: "approval_waiting", title: "Nomvula Sithole needs your approval on HD-1047", body: "New laptop for Sizwe Ndlovu", at: hoursAgo(5) },
    { user: 1003, ticket: 1052, actor: 1004, type: "approval_waiting", title: "Ayesha Patel needs your approval on HD-1052", body: "Adobe Acrobat Pro licence", at: hoursAgo(2) },
    { user: 1003, ticket: 1020, actor: 1022, type: "low_csat", title: "Zanele Khumalo rated HD-1020 2 stars", body: "Fixed, but nobody told me it was done.", at: daysAgo(5, 16), read: true },
  );
  for (const n of notes) {
    const { rows } = await c.query(
      `INSERT INTO notification (user_id, ticket_id, actor_id, type, title, body, read_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING notification_id`,
      [n.user, n.ticket, n.actor, n.type, n.title, n.body ?? null, n.read ? n.at : null, n.at],
    );
    // Each one was also an email: simulated (no SMTP while seeding), so "Sent messages" isn't empty
    await c.query(
      `INSERT INTO outbox (channel, recipient, user_id, notification_id, ticket_id, subject, body, status, attempts, created_at)
       SELECT 'email', u.email, u.user_id, $2, $3, $4, '<p>' || replace(replace(replace($4, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>', 'SIMULATED', 1, $5
       FROM users u WHERE u.user_id = $1`,
      [n.user, rows[0].notification_id, n.ticket, n.title, n.at],
    );
  }
  // Pieter turned off email for status changes (p.18: "turning off email keeps the in-app item")
  await c.query(`INSERT INTO notification_pref (user_id, type, email) VALUES (1021, 'status_changed', false)`);

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
        `${feedback.length} ratings, ${macros.length} macros.`,
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
