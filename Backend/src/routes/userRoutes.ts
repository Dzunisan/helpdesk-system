import { Router } from "express";
import { createUser, fetchUser, updateUser, setUserActive, updateUserLegacy } from "../controllers/usersController";
import { requireAuth } from "../middleware/authMiddlware";

const router = Router();

router.use(requireAuth);

// S1 (docs/api-sprint-1.md). There is no DELETE: deactivate with PATCH /:id/active instead.
router.get("/", fetchUser);
router.get("/getUser", fetchUser); // legacy alias of GET /, declared before /:id
router.post("/", createUser);
router.get("/:id", fetchUser);
router.patch("/:id", updateUser);
router.patch("/:id/active", setUserActive);

// Legacy addresses still called by UsersContext / the profile page until they move to services/users.ts
router.post("/create", createUser);
router.put("/update", updateUserLegacy);
router.put("/update/:id", updateUserLegacy);
router.put("/:id", updateUserLegacy);

export default router;
