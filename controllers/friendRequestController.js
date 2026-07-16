const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const FriendRequest = require('../models/friendRequestModel');
const User = require('../models/userModel');

/**
 * @desc    Send a friend request
 * @route   POST /api/user/friend-request/:receiverId
 * @access  Private
 */
const sendFriendRequest = asyncHandler(async (req, res) => {
  const { receiverId } = req.params;
  const senderId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(receiverId)) {
    res.status(400);
    throw new Error('Invalid user ID.');
  }

  if (senderId.equals(receiverId)) {
    res.status(400);
    throw new Error("You can't send a friend request to yourself.");
  }

  const receiver = await User.findById(receiverId);
  if (!receiver) {
    res.status(404);
    throw new Error('User to send request to not found.');
  }

  // Check if they are already friends
  const areFriends = req.user.friends.some(friendId => friendId.equals(receiverId));
  if (areFriends) {
    res.status(400);
    throw new Error('You are already friends with this user.');
  }

  // Check if a friend request already exists between them (in either direction)
  const existingRequest = await FriendRequest.findOne({
    $or: [
      { sender: senderId, receiver: receiverId },
      { sender: receiverId, receiver: senderId },
    ],
  });

  if (existingRequest) {
    if (existingRequest.status === 'sent') {
      throw new Error('A friend request has already been sent.');
    } else if (existingRequest.status === 'accepted') {
      throw new Error('You are already friends.');
    }
  }

  const friendRequest = await FriendRequest.create({
    sender: senderId,
    receiver: receiverId,
  });

  // TODO: Emit a socket event to the receiver to notify them in real-time
  // const io = req.app.get('socketio');
  // io.to(receiverId).emit('new_friend_request', { from: req.user.username });

  res.status(201).json({
    message: 'Friend request sent successfully.',
    request: friendRequest,
  });
});

/**
 * @desc    Get friendship status with another user
 * @route   GET /api/user/friend-status/:otherUserId
 * @access  Private
 */
const getFriendshipStatus = asyncHandler(async (req, res) => {
  const { otherUserId } = req.params;
  const currentUserId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
    res.status(400);
    throw new Error('Invalid user ID.');
  }

  // 1. Check if they are already friends
  const areFriends = req.user.friends.some(friendId => friendId.equals(otherUserId));
  if (areFriends) {
    return res.json({ status: 'friends' });
  }

  // 2. Check for an existing friend request
  const existingRequest = await FriendRequest.findOne({
    $or: [
      { sender: currentUserId, receiver: otherUserId },
      { sender: otherUserId, receiver: currentUserId },
    ],
    status: 'sent', // Only consider pending requests
  });

  if (existingRequest) {
    if (existingRequest.sender.equals(currentUserId)) {
      return res.json({ status: 'request_sent', requestId: existingRequest._id });
    } else {
      return res.json({ status: 'request_received', requestId: existingRequest._id });
    }
  }

  // 3. If none of the above, they are not friends and there is no pending request
  res.json({ status: 'not_friends' });
});

/**
 * @desc    Get all pending friend requests for the current user
 * @route   GET /api/user/friend-requests
 * @access  Private
 */
const getFriendRequests = asyncHandler(async (req, res) => {
  const requests = await FriendRequest.find({
    receiver: req.user._id,
    status: 'sent',
  }).populate('sender', 'username profilePic bio');

  // Convert profile pic URLs if they are GridFS references
  const requestsWithUrls = requests.map(reqObj => {
    const obj = reqObj.toObject();
    if (obj.sender && obj.sender.profilePic && obj.sender.profilePic.startsWith('gridfs://')) {
      const fileId = obj.sender.profilePic.replace('gridfs://', '');
      obj.sender.profilePic = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
    }
    return obj;
  });

  res.json(requestsWithUrls);
});

/**
 * @desc    Accept a friend request
 * @route   PUT /api/user/friend-request/:requestId/accept
 * @access  Private
 */
const acceptFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await FriendRequest.findById(requestId);
  if (!request) {
    res.status(404);
    throw new Error('Friend request not found.');
  }

  // Verify that the receiver is the current user
  if (!request.receiver.equals(req.user._id)) {
    res.status(401);
    throw new Error('Not authorized to accept this friend request.');
  }

  if (request.status !== 'sent') {
    res.status(400);
    throw new Error('Friend request is not pending.');
  }

  request.status = 'accepted';
  await request.save();

  // Add each user to the other's friends array
  await User.findByIdAndUpdate(request.sender, {
    $addToSet: { friends: request.receiver },
  });
  await User.findByIdAndUpdate(request.receiver, {
    $addToSet: { friends: request.sender },
  });

  res.json({
    message: 'Friend request accepted successfully.',
    request,
  });
});

/**
 * @desc    Reject a friend request
 * @route   PUT /api/user/friend-request/:requestId/reject
 * @access  Private
 */
const rejectFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;

  const request = await FriendRequest.findById(requestId);
  if (!request) {
    res.status(404);
    throw new Error('Friend request not found.');
  }

  // Verify that the receiver is the current user
  if (!request.receiver.equals(req.user._id)) {
    res.status(401);
    throw new Error('Not authorized to reject this friend request.');
  }

  if (request.status !== 'sent') {
    res.status(400);
    throw new Error('Friend request is not pending.');
  }

  request.status = 'rejected';
  await request.save();

  res.json({
    message: 'Friend request rejected successfully.',
    request,
  });
});


/**
 * @desc    Get friend suggestions (users who are not friends and have no pending requests)
 * @route   GET /api/user/suggestions
 * @access  Private
 */
const getFriendSuggestions = asyncHandler(async (req, res) => {
  const currentUserId = req.user._id;

  // 1. Get all friend requests involving the current user
  const requests = await FriendRequest.find({
    $or: [
      { sender: currentUserId },
      { receiver: currentUserId }
    ],
    status: 'sent'
  });

  // Extract the user IDs of people we have pending requests with
  const pendingUserIds = requests.map(r => 
    r.sender.equals(currentUserId) ? r.receiver : r.sender
  );

  // Include current user and their existing friends in the list to exclude
  const excludeUserIds = [
    currentUserId,
    ...req.user.friends,
    ...pendingUserIds
  ];

  // Find users not in the exclusion list
  const suggestions = await User.find({
    _id: { $nin: excludeUserIds }
  }).select('username profilePic bio');

  // Convert profile pic URLs
  const suggestionsWithUrls = suggestions.map(user => {
    const userObj = user.toObject();
    if (userObj.profilePic && userObj.profilePic.startsWith('gridfs://')) {
      const fileId = userObj.profilePic.replace('gridfs://', '');
      userObj.profilePic = `${req.protocol}://${req.get('host')}/api/user/profile-pic/${fileId}`;
    }
    return userObj;
  });

  res.json(suggestionsWithUrls);
});


/**
 * @desc    Unfriend a user
 * @route   POST /api/user/unfriend/:id
 * @access  Private
 */
const unfriendUser = asyncHandler(async (req, res) => {
  const targetUserId = req.params.id;
  const currentUserId = req.user._id;

  // Pull target user from current user's friends list
  await User.findByIdAndUpdate(currentUserId, {
    $pull: { friends: targetUserId }
  });

  // Pull current user from target user's friends list
  await User.findByIdAndUpdate(targetUserId, {
    $pull: { friends: currentUserId }
  });

  // Delete any existing friend requests between them
  await FriendRequest.deleteMany({
    $or: [
      { sender: currentUserId, receiver: targetUserId },
      { sender: targetUserId, receiver: currentUserId }
    ]
  });

  res.json({ success: true, message: 'Unfriended successfully.' });
});


module.exports = {
  sendFriendRequest,
  getFriendshipStatus,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendSuggestions,
  unfriendUser,
};