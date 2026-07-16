const User = require("../models/userModel");
const Otp = require("../models/otpModel");
const asyncHandler = require("express-async-handler");
const {
  generateAuthTokens,
  generateAccessToken,
  verifyRefreshToken,
} = require("../utils/tokenUtils");
const sendEmail = require("../config/emailConfig");
const otpGenerator = require("otp-generator");

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const getProfilePicUrl = (req, profilePic) => {
  if (!profilePic) {
    return '';
  }

  if (profilePic.startsWith('gridfs://')) {
    const fileId = profilePic.replace('gridfs://', '');
    return `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
  }

  return profilePic;
};

const registerUser = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const userExists = await User.findOne({ email });
  if (userExists) {
    res.status(400);
    throw new Error("An account with this email already exists.");
  }

  // If an old OTP exists for this email, delete it before creating a new one.
  await Otp.deleteOne({ email });

  // Generate a 6-digit numeric OTP
  const otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
    lowerCaseAlphabets: false,
  });

  // Save OTP to the OTP collection
  await Otp.create({ email, otp });

  // Send OTP to user's email
  const message = `Your verification code for Bubble is: ${otp}\nThis code will expire in 10 minutes.`;
  await sendEmail({
    email: email,
    subject: "Bubble - Email Verification",
    message,
  });

  const verificationToken = generateAccessToken({ email, purpose: "email_verification" }, '10m');

  res.status(200).json({
    success: true,
    message: `An OTP has been sent to ${email}. Please verify.`,
    verificationToken,
  });
});


const verifyEmail = asyncHandler(async (req, res) => {
  const { otp } = req.body;
  const email = req.verifiedEmail;

  if (!otp) {
    return res.status(400).json({ message: "OTP is required." });
  }

  if (!email) {
    return res.status(401).json({ message: "Verification token is required." });
  }

  const verificationData = await Otp.findOne({ email, otp });

  if (!verificationData) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  verificationData.verified = true;
  await verificationData.save();

  res.status(200).json({
    message: "Email verification successful.",
    success: true,
  });
});

const createUser = asyncHandler(async (req, res) => {
  const { username, password, publicKey } = req.body;
  const verifiedEmail = req.verifiedEmail;

  if (!verifiedEmail) {
    res.status(401);
    throw new Error("Verification token is required.");
  }

  if (!username || !password || !publicKey) {
    res.status(400);
    throw new Error("Username, password, and public key are required.");
  }

  const verifiedOtp = await Otp.findOne({ email: verifiedEmail, verified: true });
  if (!verifiedOtp) {
    res.status(400);
    throw new Error("Email must be verified before creating an account.");
  }

  const userExists = await User.findOne({ $or: [{ email: verifiedEmail }, { username }] });
  if (userExists) {
    await Otp.deleteOne({ email: verifiedEmail });
    res.status(400);
    throw new Error("User with this email or username already exists.");
  }

  const user = await User.create({
    email: verifiedEmail,
    username,
    password,
    publicKey,
  });

  await Otp.deleteOne({ email: verifiedEmail });

  const { accessToken, refreshToken } = generateAuthTokens(user._id);

  setRefreshTokenCookie(res, refreshToken);

  res.status(201).json({
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      profilePic: getProfilePicUrl(req, user.profilePic),
      bio: user.bio || '',
    },
    token: accessToken,
  });
});

const logoutUser = (req, res) => {
  try {
    res.cookie('refreshToken', '', { httpOnly: true, expires: new Date(0) });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const passwordMatch = await user.matchPassword(password);

  if (passwordMatch) {
    const { accessToken, refreshToken } = generateAuthTokens(user._id);

    setRefreshTokenCookie(res, refreshToken);

    res.json({
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePic: getProfilePicUrl(req, user.profilePic),
        bio: user.bio || '',
      },
      token: accessToken,
    });
  } else {
    res.status(401);
    throw new Error('Invalid email or password');
  }
});

const checkVerificationStatus = asyncHandler(async (req, res) => {
  const verifiedEmail = req.verifiedEmail;

  if (!verifiedEmail) {
    return res.status(401).json({ message: "Verification token is required." });
  }

  const verifiedOtp = await Otp.findOne({ email: verifiedEmail, verified: true });

  if (!verifiedOtp) {
    res.status(400);
    throw new Error("Email is not verified.");
  }

  res.status(200).json({ verified: true, email: verifiedEmail });
});

/**
 * @desc    Forgot password - send OTP
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
 
  if(!user){
    res.status(400);
    throw new Error("User not found");
  }

  // Delete any old OTPs for this email
  await Otp.deleteOne({ email });

  // Generate a new OTP
  const otp = otpGenerator.generate(6, {
    upperCaseAlphabets: false,
    specialChars: false,
    lowerCaseAlphabets: false,
  });

  // Save the new OTP
  await Otp.create({ email, otp });

  // Send the email
  const message = `Your password reset code for Bubble is: ${otp}\nThis code will expire in 10 minutes.`;
  await sendEmail({
    email: email,
    subject: "Bubble - Password Reset",
    message,
  });

  res.status(200).json({
    success: true,
    message: "If a user with this email exists, a password reset OTP has been sent.",
  });
});

/**
 * @desc    Reset password with OTP
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const otpData = await Otp.findOne({ email, otp });
  if (!otpData) {
    res.status(400);
    throw new Error("Invalid or expired OTP.");
  }

  const user = await User.findOne({ email });
  user.password = newPassword; // The pre-save hook in userModel will hash it
  await user.save();

  await Otp.deleteOne({ email, otp }); // Clean up the used OTP

  res.status(200).json({ success: true, message: "Password has been reset successfully." });
});

/**
 * @desc    Refresh access token using refresh token cookie
 * @route   POST /api/auth/refresh
 * @access  Public
 */
const refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    res.status(401);
    throw new Error("Refresh token is required.");
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401);
      throw new Error("User not found.");
    }

    // Generate a new set of tokens
    const tokens = generateAuthTokens(user._id);

    // Set the new refresh token in the cookie
    setRefreshTokenCookie(res, tokens.refreshToken);

    res.status(200).json({
      token: tokens.accessToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(401);
    throw new Error("Invalid or expired refresh token.");
  }
});

module.exports = { 
  registerUser, 
  verifyEmail, 
  createUser, 
  checkVerificationStatus, 
  loginUser, 
  logoutUser, 
  forgotPassword, 
  resetPassword,
  refreshAccessToken
};
