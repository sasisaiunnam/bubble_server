const buildAvatarUrl = (community, req) => {
    if (!community.avatarUrl) return community;

    if (community.avatarUrl.startsWith("gridfs://")) {
        const fileId = community.avatarUrl.replace("gridfs://", "");

        community.avatarUrl =
            `${req.protocol}://${req.get("host")}/api/user/profile-pic/${fileId}`;
    }

    return community;
};

module.exports = {
    buildAvatarUrl,
};