import { login, logout, me, forgotPassword, resetPassword, verifyResetToken} from "../controllers/authController";
import { requireAuth } from "../middleware/authMiddlware";
import { Router } from "express";
import { notImplemented } from "../utils/notImplemented";

const router = Router();

// No public /register: accounts are created by admins via POST /api/users/create
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/verify", verifyResetToken);
router.post("/reset-password", resetPassword);
// S1: first sign-in with a temporary password (docs/api-sprint-1.md)
router.post("/change-password", requireAuth, notImplemented("S1 POST /api/auth/change-password"));
router.get("/protected-test", requireAuth, (req, res) => {
    res.status(200).json({ message: "You got through the middleware", user: req.user }); // Added to test the middleware 
});


export default router;