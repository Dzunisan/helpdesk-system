import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { listSlaPolicies, updateSlaPolicy } from "../controllers/slaPolicyController";

const router = Router();

router.use(requireAuth);

// S3 (briefing p.12)
router.get("/", listSlaPolicies);
router.put("/:priority", requireRole("System Admin"), updateSlaPolicy);

export default router;
