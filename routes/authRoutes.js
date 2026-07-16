const express = require("express");
const router = express.Router();
const {
  registerUser,
  verifyEmail,
  createUser,
  checkVerificationStatus,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
} = require("../controllers/authController");
const { protectVerification } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/verify-email", protectVerification, verifyEmail);
router.post("/verification-status", protectVerification, checkVerificationStatus);
router.post("/create-user", protectVerification, createUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/refresh", refreshAccessToken);


module.exports = router;
