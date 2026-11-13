// Must be first: loads .env and exits with a clear error if JWT_SECRET is missing
import "./src/config/env";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { testDbConnection } from "./src/config/database";
import { isEmailConfigured } from "./src/utils/smtp";
import authRoutes from "./src/routes/authRoutes";
import userRoutes from "./src/routes/userRoutes";
import ticketRoutes from "./src/routes/ticketRoutes";
import departmentRoutes from "./src/routes/departmentRoutes";
import commentRoutes from "./src/routes/commentRoutes";
import reportRoutes from "./src/routes/reportRoutes";
import categoryRoutes from "./src/routes/categoryRoutes";
import slaPolicyRoutes from "./src/routes/slaPolicyRoutes";
// Sprint 2 (docs/api-sprint-2.md): each file has one feature owner
import approvalRoutes from "./src/routes/approvalRoutes";
import macroRoutes from "./src/routes/macroRoutes";
import notificationRoutes from "./src/routes/notificationRoutes";
import meRoutes from "./src/routes/meRoutes";
import adminRoutes from "./src/routes/adminRoutes";
import csatRoutes from "./src/routes/csatRoutes";
import attachmentRoutes from "./src/routes/attachmentRoutes";

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 5000;

app.use(cors({origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true}));
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no body (e.g. PUT /tickets/:id/assign)
app.use((req, _res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(cookieParser());
app.get("/", (req, res) => {
  res.send("Helpdesk System API is running");
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tickets", ticketRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/sla-policies", slaPolicyRoutes);
app.use("/api/approvals", approvalRoutes); // S6
app.use("/api/macros", macroRoutes); // S7
app.use("/api/reports", csatRoutes); // S10 /api/reports/csat, next to reportRoutes (S8)
app.use("/api/notifications", notificationRoutes); // S9
app.use("/api/me", meRoutes); // S9 notification prefs
app.use("/api/admin", adminRoutes); // S9 outbox + jobs
app.use("/api/attachments", attachmentRoutes); // S14

const startServer = async () => {
  await testDbConnection();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(
      isEmailConfigured()
        ? `Email: sending through ${process.env.EMAIL_HOST} as ${process.env.EMAIL_USER}`
        : "Email: not configured (EMAIL_HOST, EMAIL_USER, EMAIL_PASS), so emails are simulated",
    );
  });
};

startServer();
