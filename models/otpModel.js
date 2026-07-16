const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  otp: {
    type: String,
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // This is a TTL (Time To Live) index. MongoDB will automatically delete documents
    // from this collection 10 minutes (600 seconds) after the `createdAt` time.
    expires: 600,
  },
});

module.exports = mongoose.model("Otp", otpSchema);