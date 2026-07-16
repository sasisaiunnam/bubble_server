// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../config/multerGridFS');
const {
  getUserProfile,
  updateUserProfile,
  getProfilePicture,
  getAllUsers,
  getUserById,
  deleteUser
} = require('../controllers/userController');
const { getUserCommunities } = require('../controllers/userController');
const {
  sendFriendRequest,
  getFriendshipStatus,
  getFriendRequests,
  acceptFriendRequest,
  rejectFriendRequest,
  getFriendSuggestions,
  unfriendUser,
} = require('../controllers/friendRequestController');

// Public routes
router.get('/profile-pic/:id', getProfilePicture);

// Protected routes
router.use(protect);

// Profile routes
router.get('/profile', getUserProfile);
router.put('/profile', upload.single('profilePic'), updateUserProfile);
router.get('/communities', getUserCommunities);

// Friend request routes
router.get('/friend-requests', getFriendRequests);
router.get('/suggestions', getFriendSuggestions);
router.post('/friend-request/:receiverId', sendFriendRequest);
router.get('/friend-status/:otherUserId', getFriendshipStatus);
router.put('/friend-request/:requestId/accept', acceptFriendRequest);
router.put('/friend-request/:requestId/reject', rejectFriendRequest);
router.post('/unfriend/:id', unfriendUser);

router.get('/', getAllUsers);
router.get('/:id', getUserById);
router.delete('/:id', deleteUser);

module.exports = router;