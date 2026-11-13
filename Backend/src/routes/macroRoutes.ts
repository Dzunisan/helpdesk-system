import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { createMacro, listMacros, renderMacro, updateMacro } from "../controllers/macrosController";

const router = Router();

router.use(requireAuth);

// S7 (briefing p.16, docs/api-sprint-2.md)
router.get("/", requireRole("Agent", "Department Lead"), listMacros);
router.get("/:id/render", requireRole("Agent", "Department Lead"), renderMacro);
router.post("/", requireRole("Department Lead"), createMacro);
router.patch("/:id", requireRole("Department Lead"), updateMacro);

export default router;
