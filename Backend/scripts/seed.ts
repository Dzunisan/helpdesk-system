// Fills the database with the Mzansi Freight demo data from the team briefing.
// WARNING: wipes every table first, so it only runs when DB_HOST is localhost/127.0.0.1.
// Run:  npm run db:seed   (or npm run db:reset to rebuild the schema and seed in one go)
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
  // The six demo logins from the briefing (page 28)
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

const categories = [
  { id: 1, dept: 1, name: "Laptop or hardware fault" },
  { id: 2, dept: 1, name: "Network, Wi-Fi & VPN" },
  { id: 3, dept: 1, name: "Passwords & sign-in" },
  { id: 4, dept: 1, name: "Software problem" },
  { id: 5, dept: 1, name: "Printers & scanning" },
  { id: 6, dept: 2, name: "Payroll query" },
  { id: 7, dept: 2, name: "Leave" },
  { id: 8, dept: 2, name: "Employment letter" },
  { id: 9, dept: 3, name: "Building & maintenance" },
  { id: 10, dept: 3, name: "Desk, parking & access card" },
  { id: 11, dept: 4, name: "Travel & expense claims" },
  { id: 12, dept: 4, name: "Invoices & payments" },
];

const requestTypes = [
  { id: 1, dept: 1, name: "Fix a problem", kind: "fix_it", extra: null },
  { id: 2, dept: 1, name: "Software purchase", kind: "provision", extra: "software_name, cost_per_year, reason, needed_by" },
  { id: 3, dept: 1, name: "New hardware", kind: "provision", extra: "item, estimated_cost, reason" },
  { id: 4, dept: 1, name: "Access to a system or folder", kind: "provision", extra: "system, reason" },
  { id: 5, dept: 2, name: "HR query", kind: "fix_it", extra: null },
  { id: 6, dept: 3, name: "Facilities request", kind: "fix_it", extra: null },
  { id: 7, dept: 4, name: "Finance query", kind: "fix_it", extra: null },
];

type Status = "Open" | "In progress" | "Pending approval" | "Resolved" | "Closed" | "Cancelled";
type T = {
  id: number; title: string; description: string; dept: number; cat: number | null; type: number;
  priority: "High" | "Medium" | "Low"; status: Status; requester: number; assignee: number | null; hoursAgo: number;
};

const tickets: T[] = [
  { id: 1048, title: "VPN drops every 10 minutes on home fibre", description: "Since Monday my VPN (FortiClient) disconnects roughly every 10 minutes when I work from home in Midrand. Office Wi-Fi is fine.", dept: 1, cat: 2, type: 1, priority: "High", status: "In progress", requester: 1001, assignee: 1002, hoursAgo: 6 },
  { id: 1045, title: "Can't log in to Sage after password change", description: "Sage 300 says invalid credentials since I changed my Windows password this morning.", dept: 1, cat: 3, type: 1, priority: "High", status: "In progress", requester: 1020, assignee: 1002, hoursAgo: 3 },
  { id: 1041, title: "Outlook not syncing on my iPhone", description: "Mail stopped arriving on my phone yesterday afternoon.", dept: 1, cat: 4, type: 1, priority: "Medium", status: "In progress", requester: 1001, assignee: 1002, hoursAgo: 30 },
  { id: 1050, title: "Laptop screen cracked after a fall", description: "Dropped my laptop at the depot, screen is cracked in the corner.", dept: 1, cat: 1, type: 1, priority: "High", status: "Open", requester: 1021, assignee: null, hoursAgo: 2 },
  { id: 1046, title: "New starter: laptop & accounts for Sizwe Ndlovu", description: "Sizwe starts in HR on 17 Nov and needs a laptop, email and VPN.", dept: 1, cat: 1, type: 1, priority: "Medium", status: "Open", requester: 1012, assignee: null, hoursAgo: 2 },
  { id: 1044, title: "3rd floor printer in Rosebank keeps jamming", description: "Jams on every second page.", dept: 1, cat: 5, type: 1, priority: "Medium", status: "Open", requester: 1022, assignee: null, hoursAgo: 1 },
  { id: 1043, title: "Teams camera not working in Boardroom 2", description: "Camera shows a black screen in Teams meetings.", dept: 1, cat: 4, type: 1, priority: "Medium", status: "Open", requester: 1017, assignee: null, hoursAgo: 1 },
  { id: 1035, title: "Wi-Fi drops in the Durban office canteen", description: "Signal disappears near the canteen windows.", dept: 1, cat: 2, type: 1, priority: "Medium", status: "Open", requester: 1004, assignee: null, hoursAgo: 5 },
  { id: 1039, title: "Monitor flickers when laptop is docked", description: "Second screen flickers every few seconds.", dept: 1, cat: 1, type: 1, priority: "Low", status: "Open", requester: 1022, assignee: null, hoursAgo: 24 },
  { id: 1031, title: "Dock not detecting second screen", description: "Only the laptop screen works when docked.", dept: 1, cat: 1, type: 1, priority: "Low", status: "In progress", requester: 1021, assignee: 1002, hoursAgo: 48 },
  { id: 1036, title: "Power BI Pro licence", description: "Need Power BI Pro to share the fleet dashboard.", dept: 1, cat: 4, type: 2, priority: "Medium", status: "In progress", requester: 1004, assignee: 1010, hoursAgo: 26 },
  { id: 1052, title: "Adobe Acrobat Pro licence", description: "I edit and sign supplier contracts every day. Software: Adobe Acrobat Pro (annual), R3 960 per year.", dept: 1, cat: 4, type: 2, priority: "Medium", status: "Pending approval", requester: 1004, assignee: null, hoursAgo: 2 },
  { id: 1047, title: "New laptop for Sizwe Ndlovu", description: "Standard staff laptop, estimated R18 500.", dept: 1, cat: 1, type: 3, priority: "Medium", status: "Pending approval", requester: 1012, assignee: null, hoursAgo: 5 },
  { id: 1040, title: "Access to the Finance reporting folder", description: "Need read access to \\\\finance\\reporting for month-end.", dept: 1, cat: null, type: 4, priority: "Low", status: "Pending approval", requester: 1001, assignee: null, hoursAgo: 24 },
  { id: 1029, title: "Docking station replacement", description: "My dock stopped charging the laptop.", dept: 1, cat: 1, type: 1, priority: "Medium", status: "Resolved", requester: 1001, assignee: 1010, hoursAgo: 72 },
  { id: 1027, title: "Shared mailbox for Durban dispatch", description: "Please create dispatch.durban@ for the team.", dept: 1, cat: 4, type: 1, priority: "Low", status: "Closed", requester: 1004, assignee: 1002, hoursAgo: 120 },
  { id: 1053, title: "October payslip is missing my travel allowance", description: "The R1 200 travel allowance isn't on my October payslip.", dept: 2, cat: 6, type: 5, priority: "Medium", status: "Open", requester: 1001, assignee: null, hoursAgo: 4 },
  { id: 1054, title: "Employment letter for bond application", description: "Bank needs a letter confirming my salary and start date.", dept: 2, cat: 8, type: 5, priority: "Low", status: "In progress", requester: 1020, assignee: 1013, hoursAgo: 20 },
  { id: 1057, title: "Aircon dripping onto my desk", description: "Water dripping from the aircon onto my desk on the 3rd floor, Rosebank. Carpet is soaked.", dept: 1, cat: 1, type: 1, priority: "Medium", status: "Open", requester: 1022, assignee: null, hoursAgo: 1 }, // misfiled in IT on purpose (S12 demo)
  { id: 1055, title: "Parking bay at Rosebank", description: "Need a parking bay from 1 December.", dept: 3, cat: 10, type: 6, priority: "Low", status: "Open", requester: 1001, assignee: null, hoursAgo: 8 },
  { id: 1056, title: "Claim for toll fees, Durban trip", description: "Toll receipts attached for the 4 Nov Durban trip.", dept: 4, cat: 11, type: 7, priority: "Low", status: "Cancelled", requester: 1020, assignee: null, hoursAgo: 96 },
];

const comments = [
  { ticket: 1048, author: 1001, body: "Month-end close is Friday, so this is urgent for me.", internal: false, hoursAgo: 6 },
  { ticket: 1048, author: 1002, body: "Same pattern as HD-0987 (Vumatel CGNAT). @Sipho can you confirm the fix?", internal: true, hoursAgo: 5.5 },
  { ticket: 1048, author: 1002, body: "Hi Lerato, please switch to the Johannesburg-TCP profile in FortiClient and send me a screenshot.", internal: false, hoursAgo: 5 },
  { ticket: 1048, author: 1001, body: "Done, the TCP profile has held for 40 minutes so far!", internal: false, hoursAgo: 2.5 },
  { ticket: 1045, author: 1002, body: "Sage keeps its own copy of the password. Asking Megan to reset it in Sage Admin.", internal: true, hoursAgo: 2 },
  { ticket: 1029, author: 1010, body: "Swapped your dock for a new Dell WD19S. Both screens tested at your desk.", internal: false, hoursAgo: 60 },
];

// ---------- seed ----------

const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);

async function seed(c: PoolClient) {
  await c.query(`TRUNCATE ticket_feedback, internal_note, comment, ticket, request_type, category, users, department RESTART IDENTITY CASCADE`);

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

  for (const cat of categories) {
    await c.query(`INSERT INTO category (category_id, department_id, category_name) VALUES ($1,$2,$3)`, [cat.id, cat.dept, cat.name]);
  }

  for (const r of requestTypes) {
    await c.query(
      `INSERT INTO request_type (request_type_id, department_id, request_type_name, kind, extra_fields) VALUES ($1,$2,$3,$4,$5)`,
      [r.id, r.dept, r.name, r.kind, r.extra],
    );
  }

  for (const t of tickets) {
    await c.query(
      `INSERT INTO ticket (ticket_id, title, description, ticket_department_id, ticket_category_id, ticket_request_type_id,
                           ticket_priority, ticket_status, requester_id, assignee_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
      [t.id, t.title, t.description, t.dept, t.cat, t.type, t.priority, t.status, t.requester, t.assignee, ago(t.hoursAgo)],
    );
  }

  for (const cm of comments) {
    await c.query(
      `INSERT INTO comment (ticket_id, author_id, body, is_internal, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$5)`,
      [cm.ticket, cm.author, cm.body, cm.internal, ago(cm.hoursAgo)],
    );
  }

  await c.query(
    `INSERT INTO ticket_feedback (ticket_id, user_id, rating, comment) VALUES ($1,$2,$3,$4)`,
    [1027, 1004, 5, "Sorted the same day, thanks!"],
  );

  // We inserted fixed ids, so move each id counter past them for new rows.
  for (const [table, col] of [["department", "department_id"], ["category", "category_id"], ["request_type", "request_type_id"], ["ticket", "ticket_id"]]) {
    await c.query(`SELECT setval(pg_get_serial_sequence('${table}', '${col}'), (SELECT MAX(${col}) FROM ${table}))`);
  }
}

export async function runSeed(): Promise<void> {
  assertLocalDb("seed the database");
  const pool = new Pool(dbConfig());
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seed(client);
    await client.query("COMMIT");
    console.log(
      `Seeded ${departments.length} departments, ${users.length} users, ${categories.length} categories, ` +
        `${requestTypes.length} request types, ${tickets.length} tickets, ${comments.length} comments, 1 feedback.`,
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
