const asyncHandler = require('express-async-handler');
const User = require('../models/userModel');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const { getGridFSBucket } = require('../config/db');
const { uploadFileToGridFS, deleteFileFromGridFS } = require('../utils/gridFSUtils');

/**
 * @desc    Get user profile
 * @route   GET /api/user/profile
 * @access  Private
 */
const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('-password')
    .populate('friends', 'username profilePic bio');

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Convert GridFS ID to URL if profile picture exists
  let profilePicUrl = user.profilePic;
  if (profilePicUrl && profilePicUrl.startsWith('gridfs://')) {
    const fileId = profilePicUrl.replace('gridfs://', '');
    profilePicUrl = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
  }

  // Convert profile pic URLs for friends if they are GridFS references
  const friendsWithPicUrls = (user.friends || []).map(friend => {
    const friendObj = friend.toObject ? friend.toObject() : friend;
    if (friendObj.profilePic && friendObj.profilePic.startsWith('gridfs://')) {
      const fileId = friendObj.profilePic.replace('gridfs://', '');
      friendObj.profilePic = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
    }
    return friendObj;
  });

  res.json({
    _id: user._id,
    username: user.username,
    email: user.email,
    profilePic: profilePicUrl,
    bio: user.bio,
    friends: friendsWithPicUrls,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });
});

/**
 * @desc    Update user profile with GridFS
 * @route   PUT /api/user/profile
 * @access  Private
 */
const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Log incoming data for debugging
  console.log('📝 Update request received:');
  console.log('Body:', req.body);
  console.log('File:', req.file ? `File: ${req.file.originalname}` : 'No file');

  // 1. Update username with validation
  if (req.body.username !== undefined) {
    const trimmedUsername = req.body.username.trim();
    
    if (!trimmedUsername || trimmedUsername.length < 3) {
      res.status(400);
      throw new Error('Username must be at least 3 characters');
    }

    if (trimmedUsername.length > 20) {
      res.status(400);
      throw new Error('Username cannot exceed 20 characters');
    }

    // Check username uniqueness
    const existingUser = await User.findOne({ 
      username: trimmedUsername,
      _id: { $ne: user._id }
    });
    
    if (existingUser) {
      res.status(400);
      throw new Error('Username is already taken');
    }
    
    user.username = trimmedUsername;
  }

  // 2. Update bio with validation
  if (req.body.bio !== undefined) {
    if (req.body.bio.length > 200) {
      res.status(400);
      throw new Error('Bio cannot exceed 200 characters');
    }
    user.bio = req.body.bio.trim() || '';
  }

  // 3. Handle profile picture upload
  if (req.file) {
    try {
      // Validate file type
      const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        res.status(400);
        throw new Error('Invalid file type. Please upload JPEG, PNG, GIF, or WEBP.');
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.size > maxSize) {
        res.status(400);
        throw new Error('File too large. Maximum size is 5MB.');
      }

      // Delete old profile picture if exists
      if (user.profilePic && user.profilePic.startsWith('gridfs://')) {
        const oldFileId = user.profilePic.replace('gridfs://', '');
        try {
          await deleteFileFromGridFS(oldFileId);
          console.log(`✅ Deleted old profile picture: ${oldFileId}`);
        } catch (deleteError) {
          console.warn('Could not delete old profile picture:', deleteError.message);
        }
      }

      // Upload new file to GridFS
      const fileData = await uploadFileToGridFS(
        req.file.buffer,
        `${Date.now()}-${req.file.originalname}`,
        req.file.mimetype
      );

      // Store GridFS file ID in user profile
      user.profilePic = `gridfs://${fileData.id}`;
      
      console.log(`✅ Profile picture uploaded to GridFS: ${fileData.id}`);
    } catch (uploadError) {
      console.error('Error uploading profile picture:', uploadError);
      if (uploadError.message.includes('Invalid file type') || 
          uploadError.message.includes('File too large')) {
        res.status(400);
        throw uploadError;
      }
      res.status(500);
      throw new Error('Failed to upload profile picture');
    }
  } else if (req.body.profilePic === '') {
    // Remove profile picture
    if (user.profilePic && user.profilePic.startsWith('gridfs://')) {
      const fileId = user.profilePic.replace('gridfs://', '');
      try {
        await deleteFileFromGridFS(fileId);
        console.log(`✅ Deleted profile picture: ${fileId}`);
      } catch (deleteError) {
        console.warn('Could not delete profile picture:', deleteError.message);
      }
    }
    user.profilePic = '';
    console.log(`✅ Profile picture removed for user: ${user.username}`);
  }

  // 4. Update last active timestamp
  user.lastActive = Date.now();

  // 5. Save user
  const updatedUser = await user.save();

  // 6. Return user data with profile picture URL
  let profilePicUrl = updatedUser.profilePic;
  if (profilePicUrl && profilePicUrl.startsWith('gridfs://')) {
    const fileId = profilePicUrl.replace('gridfs://', '');
    profilePicUrl = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
  }

  console.log(`✅ Profile updated successfully for: ${updatedUser.username}`);

  return res.status(200).json({
    _id: updatedUser._id,
    username: updatedUser.username,
    email: updatedUser.email,
    profilePic: profilePicUrl,
    bio: updatedUser.bio,
    createdAt: updatedUser.createdAt,
    updatedAt: updatedUser.updatedAt
  });
});

/**
 * @desc    Get profile picture from GridFS
 * @route   GET /api/user/profile-pic/:id
 * @access  Public
 */
const getProfilePicture = asyncHandler(async (req, res) => {
  try {
    // Strip any query parameters from the ID
    const id = req.params.id.split('?')[0];
    
    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('Invalid profile picture ID format');
    }

    const objectId = new ObjectId(id);
    const bucket = getGridFSBucket();

    const files = await bucket.find({ _id: objectId }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ message: 'Profile picture not found' });
    }

    const file = files[0];

    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000');
    const safeFilename = String(file.filename || 'profile-picture').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.set('Content-Disposition', `inline; filename="${safeFilename}"`);

    const downloadStream = bucket.openDownloadStream(objectId);
    downloadStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        return res.status(500).json({ message: 'Failed to stream profile picture' });
      }
    });

    downloadStream.pipe(res);
    
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    if (error instanceof mongoose.Error.CastError) {
      res.status(404);
      throw new Error('Invalid profile picture ID');
    }
    throw error;
  }
});

/**
 * @desc    Get all users
 * @route   GET /api/user
 * @access  Private/Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
  // TODO: Add admin role check
  const users = await User.find({}).select('-password');
  
  // Convert profile picture IDs to URLs for each user
  const usersWithPicUrls = users.map(user => {
    const userObj = user.toObject();
    if (userObj.profilePic && userObj.profilePic.startsWith('gridfs://')) {
      const fileId = userObj.profilePic.replace('gridfs://', '');
      userObj.profilePic = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
    }
    return userObj;
  });
  
  res.json(usersWithPicUrls);
});

/**
 * @desc    Get user by ID
 * @route   GET /api/user/:id
 * @access  Private/Admin
 */
const getUserById = asyncHandler(async (req, res) => {
  // TODO: Add admin role check
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Convert profile picture ID to URL
  let profilePicUrl = user.profilePic;
  if (profilePicUrl && profilePicUrl.startsWith('gridfs://')) {
    const fileId = profilePicUrl.replace('gridfs://', '');
    profilePicUrl = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
  }

  res.json({
    _id: user._id,
    username: user.username,
    email: user.email,
    profilePic: profilePicUrl,
    bio: user.bio,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  });
});

/**
 * @desc    Delete a user
 * @route   DELETE /api/user/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  // TODO: Add admin role check
  const user = await User.findById(req.params.id);
  
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Delete profile picture from GridFS if exists
  if (user.profilePic && user.profilePic.startsWith('gridfs://')) {
    const fileId = user.profilePic.replace('gridfs://', '');
    try {
      await deleteFileFromGridFS(fileId);
      console.log(`✅ Deleted profile picture for deleted user: ${fileId}`);
    } catch (deleteError) {
      console.warn('Could not delete profile picture:', deleteError.message);
    }
  }

  await user.deleteOne();
  res.json({ message: 'User removed successfully' });
});

/**
 * @desc    Get communities for the logged-in user
 * @route   GET /api/user/communities
 * @access  Private
 */
const getUserCommunities = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: 'communityBubbles',
      select: 'name description avatarUrl isDefault isPublic' // Select specific fields
    })
    .lean(); // Use .lean() for better performance on read-only operations

  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  // Sort communities: default bubbles first, then alphabetically
  const sortedCommunities = (user.communityBubbles || []).sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.name.localeCompare(b.name);
  });

  // Convert avatarUrl to full URL if it's a GridFS ID
  sortedCommunities.forEach(community => {
    if (community.avatarUrl && community.avatarUrl.startsWith('gridfs://')) {
      if (community.isDefault) {
        community.avatarUrl = null;
      } else {
        const fileId = community.avatarUrl.replace('gridfs://', '');
        community.avatarUrl = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
      }
    }
  });

  res.status(200).json(sortedCommunities);
});

module.exports = {
  getUserProfile,
  updateUserProfile,
  getProfilePicture,
  getAllUsers,
  getUserById,
  deleteUser,
  getUserCommunities,
};