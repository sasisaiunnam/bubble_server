const CommunityBubble = require('../models/communityBubbleModel');
const User = require('../models/userModel');
const asyncHandler = require('express-async-handler');
const { buildAvatarUrl } = require('../utils/communityHelper');

const createCommunity = asyncHandler(async (req, res) => {

    const {
        name,
        description,
        isPublic = true,
        tags = [],
        avatarUrl = ""
    } = req.body;

    const userId = req.user.id;

    if (!name)
        throw new Error("Community name is required");

    if (name.startsWith("Bubble @"))
        throw new Error("Bubble @ is reserved.");

    const exists = await CommunityBubble.findOne({ name });

    if (exists)
        throw new Error("Community already exists.");

    const community = await CommunityBubble.create({

        name,
        description,
        isPublic,
        tags,
        avatarUrl,

        creator: userId,

        admins: [userId],

        members: [userId]

    });

    await User.findByIdAndUpdate(userId, {

        $addToSet: {

            communityBubbles: community._id

        }

    });

    res.status(201).json(buildAvatarUrl(community.toObject(), req));

});

const updateCommunity = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    if (community.isDefault)
        throw new Error("Default community cannot be edited.");

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin)
        throw new Error("Only admins can update.");

    Object.assign(community, req.body);

    await community.save();

    res.json(buildAvatarUrl(community.toObject(), req));

});


const getNearbyCommunities = asyncHandler(async (req, res) => {

    const {

        latitude,

        longitude,

        radius = 3000

    } = req.query;

    if (!latitude || !longitude)
        throw new Error("Latitude & Longitude required.");

    const communities = await CommunityBubble.find({

        isPublic: true,

        location: {

            $near: {

                $geometry: {

                    type: "Point",

                    coordinates: [

                        Number(longitude),

                        Number(latitude)

                    ]

                },

                $maxDistance: Number(radius)

            }

        }

    }).lean();

    const data = communities.map(c =>
        buildAvatarUrl(c, req)
    );

    res.json(data);

});


const listDiscoverableCommunities = asyncHandler(async (req, res) => {

    const userId = req.user.id;

    // Get current user's friends list
    const requestingUser = await User.findById(userId).select('friends').lean();
    const userFriends = (requestingUser?.friends || []).map(f => String(f));

    // Get all non-default communities
    const communities = await CommunityBubble.find({
        isDefault: { $ne: true }
    }).lean();

    const response = [];

    for (const c of communities) {
        // If it's private, verify if the requesting user is friends with at least one admin/creator
        if (!c.isPublic) {
            const hasAdminFriend = (c.admins || []).some(adminId => userFriends.includes(String(adminId)));
            const isCreator = String(c.creator) === String(userId);
            const isAlreadyMember = (c.members || []).some(member => String(member) === String(userId));
            const hasPendingInvite = (c.pendingInvites || []).some(invitee => String(invitee) === String(userId));
            
            // Allow discovering private community if:
            // 1. User is friends with an admin
            // 2. User is the creator
            // 3. User is already a member
            // 4. User has a pending invite (so they can accept it)
            if (!hasAdminFriend && !isCreator && !isAlreadyMember && !hasPendingInvite) {
                continue;
            }
        }

        const isMember = c.members.some(member =>
            member.equals(userId)
        );

        const hasRequestedJoin = (c.joinRequests || []).some(r =>
            r.equals(userId)
        );

        const hasInvite = (c.pendingInvites || []).some(i =>
            i.equals(userId)
        );

        delete c.members;
        delete c.joinRequests;
        delete c.pendingInvites;

        response.push({
            ...buildAvatarUrl(c, req),
            isMember,
            hasRequestedJoin,
            hasInvite
        });
    }

    res.json(response);

});

const autoJoinCommunity = asyncHandler(async (req, res) => {

    const userId = req.user.id;
    const { latitude, longitude, communityId } = req.body;
    let community;

    if (communityId) {
        // Logic to join a specific community by ID
        community = await CommunityBubble.findById(communityId);

        if (!community) {
            res.status(404);
            throw new Error("Community not found");
        }
        if (!community.isPublic) {
            res.status(403);
            throw new Error("This is a private community.");
        }

    } else if (latitude && longitude) {
        // Logic to find or create a local bubble based on location
        const lat = Number(latitude);
        const lon = Number(longitude);
        const gridX = Math.floor(lat * 100);
        const gridY = Math.floor(lon * 100);
        const gridId = `grid_${gridX}_${gridY}`;

        // 1. Search for an existing bubble at these exact coordinates (same gridId)
        community = await CommunityBubble.findOne({ gridId });

        // 2. If not found, search for any default public bubble within 3km
        if (!community) {
            community = await CommunityBubble.findOne({
                isPublic: true,
                isDefault: true,
                location: {
                    $near: {
                        $geometry: { type: "Point", coordinates: [lon, lat] },
                        $maxDistance: 3000
                    }
                }
            });
        }

        // 3. If still no local bubble is found, create a new one
        if (!community) {
            community = await CommunityBubble.create({
                name: `Bubble @ ${gridX}_${gridY}`,
                description: "Automatically generated public Bubble.",
                creator: userId,
                admins: [userId],
                members: [userId],
                isPublic: true,
                isDefault: true,
                avatarUrl: "",
                gridId,
                location: { type: "Point", coordinates: [lon, lat] },
                tags: ["local", "community"]
            });
        }
    } else {
        res.status(400);
        throw new Error("Request must include either a communityId or latitude/longitude.");
    }

    // Add user to the community if they are not already a member.
    const isMember = community.members.some(member => member.equals(userId));
    if (!isMember) {
        community.members.push(userId);
        await community.save();
    }

    // Ensure the community is in the user's list of bubbles.
    await User.findByIdAndUpdate(userId, {
        $addToSet: { communityBubbles: community._id }
    });

    res.status(200).json(buildAvatarUrl(community.toObject(), req));

});

// =============================================
// INVITE A USER TO A PRIVATE COMMUNITY (Admin only)
// =============================================
const inviteToCommunity = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin)
        throw new Error("Only admins can invite users.");

    const { userId } = req.body;

    if (!userId)
        throw new Error("User ID is required.");

    const isMember = community.members.some(m => m.equals(userId));
    if (isMember)
        throw new Error("User is already a member.");

    const alreadyInvited = community.pendingInvites.some(i => i.equals(userId));
    if (alreadyInvited)
        throw new Error("User is already invited.");

    // Remove from joinRequests if they had requested (auto-approve scenario)
    community.joinRequests = community.joinRequests.filter(r => !r.equals(userId));

    community.pendingInvites.push(userId);
    await community.save();

    res.status(200).json({ message: "Invitation sent successfully." });

});

// =============================================
// ACCEPT AN INVITE (User accepts invite to join)
// =============================================
const acceptInvite = asyncHandler(async (req, res) => {

    const userId = req.user.id;
    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const wasInvited = community.pendingInvites.some(i => i.equals(userId));
    if (!wasInvited)
        throw new Error("You have no pending invite for this community.");

    // Move from pendingInvites to members
    community.pendingInvites = community.pendingInvites.filter(i => !i.equals(userId));

    if (!community.members.some(m => m.equals(userId))) {
        community.members.push(userId);
    }

    await community.save();

    // Add community to user's list
    await User.findByIdAndUpdate(userId, {
        $addToSet: { communityBubbles: community._id }
    });

    res.status(200).json(buildAvatarUrl(community.toObject(), req));

});

// =============================================
// DECLINE AN INVITE
// =============================================
const declineInvite = asyncHandler(async (req, res) => {

    const userId = req.user.id;
    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const wasInvited = community.pendingInvites.some(i => i.equals(userId));
    if (!wasInvited)
        throw new Error("You have no pending invite for this community.");

    community.pendingInvites = community.pendingInvites.filter(i => !i.equals(userId));
    await community.save();

    res.status(200).json({ message: "Invite declined." });

});

// =============================================
// REQUEST TO JOIN A PRIVATE COMMUNITY (User-initiated)
// =============================================
const requestToJoin = asyncHandler(async (req, res) => {

    const userId = req.user.id;
    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const isMember = community.members.some(m => m.equals(userId));
    if (isMember)
        throw new Error("You are already a member.");

    const alreadyRequested = community.joinRequests.some(r => r.equals(userId));
    if (alreadyRequested)
        throw new Error("You have already requested to join.");

    const alreadyInvited = community.pendingInvites.some(i => i.equals(userId));
    if (alreadyInvited)
        throw new Error("You already have a pending invite. Accept it instead.");

    // Friend check for private communities
    if (!community.isPublic) {
        const requestingUser = await User.findById(userId).select('friends').lean();
        const userFriends = (requestingUser?.friends || []).map(f => String(f));
        const hasAdminFriend = (community.admins || []).some(adminId => userFriends.includes(String(adminId)));
        const isCreator = String(community.creator) === String(userId);

        if (!hasAdminFriend && !isCreator) {
            res.status(403);
            throw new Error("Only friends of community admins/creator can request to join private communities.");
        }
    }

    community.joinRequests.push(userId);
    await community.save();

    res.status(200).json({ message: "Join request sent successfully." });

});

// =============================================
// APPROVE A JOIN REQUEST (Admin approves a user's request)
// =============================================
const approveJoinRequest = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin)
        throw new Error("Only admins can approve join requests.");

    const { userId } = req.body;

    if (!userId)
        throw new Error("User ID is required.");

    const hasRequested = community.joinRequests.some(r => r.equals(userId));
    if (!hasRequested)
        throw new Error("This user has not requested to join.");

    // Move from joinRequests to members
    community.joinRequests = community.joinRequests.filter(r => !r.equals(userId));

    if (!community.members.some(m => m.equals(userId))) {
        community.members.push(userId);
    }

    await community.save();

    // Add community to user's list
    await User.findByIdAndUpdate(userId, {
        $addToSet: { communityBubbles: community._id }
    });

    res.status(200).json({ message: "Join request approved." });

});

// =============================================
// REJECT A JOIN REQUEST (Admin rejects a user's request)
// =============================================
const rejectJoinRequest = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id);

    if (!community)
        throw new Error("Community not found");

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin)
        throw new Error("Only admins can reject join requests.");

    const { userId } = req.body;

    if (!userId)
        throw new Error("User ID is required.");

    community.joinRequests = community.joinRequests.filter(r => !r.equals(userId));
    await community.save();

    res.status(200).json({ message: "Join request rejected." });

});

// =============================================
// GET MY PENDING INVITES (User sees their incoming invitations)
// =============================================
const getMyInvites = asyncHandler(async (req, res) => {

    const userId = req.user.id;

    const communities = await CommunityBubble.find({
        pendingInvites: userId
    }).lean();

    const data = communities.map(c => buildAvatarUrl(c, req));

    res.json(data);

});

// =============================================
// GET JOIN REQUESTS FOR A COMMUNITY (Admin sees pending requests)
// =============================================
const getJoinRequests = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id)
        .populate('joinRequests', 'username profilePic bio')
        .lean();

    if (!community)
        throw new Error("Community not found");

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin)
        throw new Error("Only admins can view join requests.");

    res.json(community.joinRequests || []);

});

// =============================================
// DELETE A COMMUNITY (Admin/Creator only)
// =============================================
const deleteCommunity = asyncHandler(async (req, res) => {

    const community = await CommunityBubble.findById(req.params.id);

    if (!community) {
        res.status(404);
        throw new Error("Community not found");
    }

    if (community.isDefault) {
        res.status(400);
        throw new Error("Default communities cannot be deleted.");
    }

    const isAdmin = community.admins.some(admin =>
        admin.equals(req.user.id)
    );

    if (!isAdmin) {
        res.status(403);
        throw new Error("Only community admins can delete this community.");
    }

    const communityId = community._id;

    // Delete the community document
    await CommunityBubble.findByIdAndDelete(communityId);

    // Remove the community ID reference from all users
    await User.updateMany(
        { communityBubbles: communityId },
        { $pull: { communityBubbles: communityId } }
    );

    res.status(200).json({ message: "Community deleted successfully.", communityId });

});

module.exports = {
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
    deleteCommunity
};