const jwt = require("jsonwebtoken");

const getAccessTokenSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return process.env.JWT_SECRET;
};

const getRefreshTokenSecret = () => {
  return process.env.REFRESH_TOKEN_SECRET || getAccessTokenSecret();
};

const generateAccessToken = (payload, expiresIn = "15m") => {
  return jwt.sign(payload, getAccessTokenSecret(), { expiresIn });
};

const generateRefreshToken = (payload, expiresIn = "7d") => {
  return jwt.sign(payload, getRefreshTokenSecret(), { expiresIn });
};

const generateAuthTokens = (userId) => {
  const payload = { id: userId };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessTokenSecret());
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshTokenSecret());
};

module.exports = {
  generateAuthTokens,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
