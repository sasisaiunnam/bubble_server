const express = require('express');
const router = express.Router();
const {
  createCommunity,
  updateCommunity,
  getNearbyCommunities,
  listDiscoverableCommunities,
  autoJoinCommunity,
  inviteToCommunity,
  acceptInvite,
  declineInvite,
  requestToJoin,
  approveJoinRequest,
  rejectJoinRequest,
  getMyInvites,
  getJoinRequests,
  deleteCommunity,
} = require('../controllers/communityBubbleController');

// You will need to create this middleware to protect routes
const { protect } = require('../middleware/authMiddleware');

router.route('/').post(protect, createCommunity);
router.route('/nearby').get(protect, getNearbyCommunities);
router.route('/discover').get(protect, listDiscoverableCommunities);
router.route('/my-invites').get(protect, getMyInvites);

router.route('/:id')
  .put(protect, updateCommunity)
  .delete(protect, deleteCommunity);
router.post("/auto-join", protect, autoJoinCommunity);

// Invite flow (admin-initiated)
router.post('/:id/invite', protect, inviteToCommunity);
router.post('/:id/accept-invite', protect, acceptInvite);
router.post('/:id/decline-invite', protect, declineInvite);

// Join request flow (user-initiated)
router.post('/:id/request-join', protect, requestToJoin);
router.post('/:id/approve-join', protect, approveJoinRequest);
router.post('/:id/reject-join', protect, rejectJoinRequest);
router.get('/:id/join-requests', protect, getJoinRequests);

module.exports = router;