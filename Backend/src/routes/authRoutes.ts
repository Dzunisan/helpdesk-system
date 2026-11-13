import { login, logout, me, forgotPassword, resetPassword, verifyResetToken} from "../controllers/authController";
import { requireAuth } from "../middleware/authMiddlware";
import { Router } from "express";

const router = Router();

// No public /register: accounts are created by admins via POST /api/users/create
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", me);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/verify", verifyResetToken);
router.post("/reset-password", resetPassword);
router.get("/protected-test", requireAuth, (req, res) => {
    res.status(200).json({ message: "You got through the middleware", user: req.user }); // Added to test the middleware 
});


export default router;