import { Router } from "express";
import { requireAuth } from "../middleware/authMiddlware";
import { attachmentThumb, deleteAttachment, downloadAttachment } from "../controllers/attachmentsController";

const router = Router();

router.use(requireAuth);

// S14 (briefing p.21, docs/api-sprint-2.md). Upload is POST /api/tickets/:id/attachments.
router.get("/:id", downloadAttachment);
router.get("/:id/thumb", attachmentThumb);
router.delete("/:id", deleteAttachment);

export default router;
