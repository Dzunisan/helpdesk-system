// Must be first: loads .env and exits with a clear error if JWT_SECRET is missing
import "./src/config/env";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { testDbConnection } from "./src/config/database";
import authRoutes from "./src/routes/authRoutes";
import userRoutes from "./src/routes/userRoutes";
import ticketRoutes from "./src/routes/ticketRoutes";
import departmentRoutes from "./src/routes/departmentRoutes";
import commentRoutes from "./src/routes/commentRoutes";

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

const startServer = async () => {
  await testDbConnection();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer();
