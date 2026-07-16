const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const { verifyAccessToken } = require('../utils/tokenUtils');

/**
 * @desc    Middleware to protect routes by verifying JWT
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = verifyAccessToken(token);
      console.log('protect decoded token:', decoded);

      // Get user from the token (excluding the password)
      req.user = await User.findById(decoded.id).select('-password');

      next();
    } catch (error) {
      console.error('protect token error:', error);
      res.status(401);
      throw new Error('Not authorized, token failed');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Not authorized, no token');
  }
});
/**
 * @desc    Middleware to verify the email verification token
 */
const protectVerification = (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = verifyAccessToken(token);

      if (decoded.purpose !== "email_verification" || !decoded.email) {
        return res.status(401).json({ message: "Invalid verification token." });
      }

      // Attach the verified email to the request object
      req.verifiedEmail = decoded.email;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = { protect, protectVerification };
