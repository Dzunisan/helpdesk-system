import { Router } from "express";
import { requireAuth } from "../middleware/authMiddlware";
import { getPrefs, savePrefs } from "../controllers/notificationsController";

const router = Router();

router.use(requireAuth);

// S9 (briefing p.18, p.68 profile): the signed-in user's own email settings per notification type
router.get("/notification-prefs", getPrefs);
router.put("/notification-prefs", savePrefs);

export default router;
