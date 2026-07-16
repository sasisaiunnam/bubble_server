const asyncHandler = require('express-async-handler');
const Location = require('../models/locationModel');
const CommunityBubble = require('../models/communityBubbleModel');
const User = require('../models/userModel');
const { getGridCellId } = require('../utils/locationUtils');

/**
 * Middleware to update a user's location if coordinates are provided in the request.
 * This should be used on routes where the frontend might send location data.
 */
const updateUserLocation = asyncHandler(async (req, res, next) => {
  // Proceed only if the user is authenticated and location data is present in the request body
  if (req.user && req.body.latitude && req.body.longitude) {
    const { latitude, longitude, accuracy } = req.body;
    const userId = req.user._id;

    const locationData = {
      user: req.user._id,
      location: {
        type: 'Point',
        // IMPORTANT: GeoJSON format is [longitude, latitude]
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      accuracy: accuracy ? parseFloat(accuracy) : 0,
      lastUpdated: Date.now(),
    };

    try {
      // Use findOneAndUpdate with upsert:true.
      // This will create a new location document if one doesn't exist for the user,
      // or update the existing one if it does.
      const userLocation = await Location.findOneAndUpdate({ user: userId }, locationData, {
        upsert: true, // Create a new doc if one doesn't exist
        new: true, // Return the new doc
        runValidators: true, // Ensure schema validation runs
      },
    );

      // === Auto-join Grid Bubble Logic ===
      const gridId = getGridCellId(latitude, longitude);

      // Find or create the bubble for the current grid cell
      let bubble = await CommunityBubble.findOne({ gridId });

      if (!bubble) {
        // If bubble doesn't exist, create it.
        bubble = await CommunityBubble.create({
          name: `Bubble @ ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
          description: `A local community bubble created automatically.`,
          isPublic: true,
          isDefault: true, // Mark as a default grid bubble
          creator: userId,
          location: userLocation.location,
          gridId: gridId,
          tags: ['local', 'automatic'],
        });
        console.log(`✅ New default bubble created: ${bubble.name} (Grid ID: ${gridId})`);
      }

      // Ensure the user is a member of this bubble.
      // Use $addToSet to prevent duplicates.
      const userUpdatePromise = User.findByIdAndUpdate(userId, {
        $addToSet: { communityBubbles: bubble._id },
      });
      const communityUpdatePromise = CommunityBubble.findByIdAndUpdate(bubble._id, {
        $addToSet: { members: userId },
      });

      await Promise.all([userUpdatePromise, communityUpdatePromise]);

    } catch (error) {
      console.error('Error updating user location in middleware:', error);
      // We call next() even on error to not block the main request flow.
      // Location update is a secondary concern.
    }
  }
  // Always call next() to pass control to the next middleware in the stack.
  next();
});

module.exports = updateUserLocation;