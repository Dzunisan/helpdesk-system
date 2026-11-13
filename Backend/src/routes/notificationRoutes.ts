import { Router } from "express";
import { requireAuth } from "../middleware/authMiddlware";
import { countNotifications, listNotifications, markAllRead, markRead } from "../controllers/notificationsController";

const router = Router();

router.use(requireAuth);

// S9 (briefing p.18, docs/api-sprint-2.md): everyone, only their own notifications
router.get("/", listNotifications);
router.get("/count", countNotifications);
router.post("/read-all", markAllRead);
router.patch("/:id/read", markRead);

export default router;
