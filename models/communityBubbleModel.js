const mongoose = require('mongoose');

const CommunityBubbleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Community name is required'],
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    gridId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple documents to have a null value, but unique if present
      // This is ideal for distinguishing grid-based bubbles from user-created ones.
      index: true,
    },
        location: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
    },
    pendingInvites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    joinRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 30,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Geospatial index
CommunityBubbleSchema.index({ location: '2dsphere' });

// Index for searching by name and tags
CommunityBubbleSchema.index({ name: 'text', description: 'text', tags: 'text' });


/**
 * Pre-save hook to ensure the creator is automatically an admin and a member
 * when a new community bubble is created.
 */
CommunityBubbleSchema.pre('save', function (next) {
  if (this.location && (!this.location.coordinates || this.location.coordinates.length !== 2)) {
    this.location = undefined;
  }

  if (this.isNew) {
    // Add creator to admins if not already there
    if (!this.admins.includes(this.creator)) {
      this.admins.push(this.creator);
    }
    // Add creator to members if not already there
    if (!this.members.includes(this.creator)) {
      this.members.push(this.creator);
    }
  }
  next();
});

module.exports = mongoose.model('CommunityBubble', CommunityBubbleSchema);