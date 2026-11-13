import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddlware";
import { createCategory, listCategories, updateCategory } from "../controllers/categoryController";

const router = Router();

router.use(requireAuth);

// S5 (briefing p.14)
router.get("/", listCategories);
router.post("/", requireRole("System Admin"), createCategory);
router.patch("/:id", requireRole("System Admin"), updateCategory);

export default router;
