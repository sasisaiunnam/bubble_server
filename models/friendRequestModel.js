const mongoose = require("mongoose");

const friendRequestSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    status: {
      type: String,
      enum: ["sent", "accepted", "rejected", "cancelled"],
      default: "sent",
    },

    message: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate requests between the same two users
friendRequestSchema.index(
  { sender: 1, receiver: 1 },
  { unique: true }
);

module.exports = mongoose.model("FriendRequest", friendRequestSchema);