const { verifyAccessToken } = require('./utils/tokenUtils');
const User = require('./models/userModel');

// Map of online users (userId -> set of socketIds) to handle multiple tabs/connections per user
const onlineUsers = new Map();

const initializeSocket = (io) => {
  // Middleware for authentication
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: Token not provided'));
    }
    try {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }
      socket.user = user;
      next();
    } catch (error) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  // Middleware to log events (for debugging)
  io.use((socket, next) => {
    socket.onAny((event, ...args) => {
      console.log(`Socket Event: ${event}`, args);
    });
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    console.log(`User connected: ${socket.user.username} (ID: ${socket.id})`);

    // Track active connection
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // If first socket connection for this user, broadcast that they are online
    if (onlineUsers.get(userId).size === 1) {
      io.emit('userStatusChanged', { userId, isOnline: true });
      console.log(`📣 Broadcasted: ${socket.user.username} is now ONLINE`);
    }

    // Join personal room for DMs
    socket.join(userId);
    console.log(`User ${socket.user.username} joined personal room: ${userId}`);

    // Provide the current list of online users on request
    socket.on('getOnlineUsers', () => {
      socket.emit('onlineUsersList', Array.from(onlineUsers.keys()));
      console.log(`Sent online users list to ${socket.user.username}`);
    });

    socket.on('joinRoom', (room) => {
      socket.join(room);
      console.log(`User ${socket.user.username} joined room: ${room}`);
    });

    socket.on('leaveRoom', (room) => {
      socket.leave(room);
      console.log(`User ${socket.user.username} left room: ${room}`);
    });

    socket.on('sendMessage', (message) => {
      // The user sends a message to a room, which is the conversationId
      // We broadcast it to everyone else in that room.
      socket.to(message.conversationId).emit('newMessage', message);

      // For DMs, also broadcast directly to the recipient's personal room
      if (message.conversationId && message.conversationId.startsWith('dm_')) {
        const parts = message.conversationId.replace('dm_', '').split('_');
        const receiverId = parts.find(id => id !== userId);
        if (receiverId) {
          io.to(receiverId).emit('newMessage', message);
        }
      }
    });

    socket.on('deleteMessage', (data) => {
      // The user deletes a message. We broadcast it to everyone else in that room.
      socket.to(data.conversationId).emit('messageDeleted', data);

      // For DMs, also broadcast directly to the recipient's personal room
      if (data.conversationId && data.conversationId.startsWith('dm_')) {
        const parts = data.conversationId.replace('dm_', '').split('_');
        const receiverId = parts.find(id => id !== userId);
        if (receiverId) {
          io.to(receiverId).emit('messageDeleted', data);
        }
      }
    });



    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username}`);
      
      // Clean up connection
      if (onlineUsers.has(userId)) {
        const sockets = onlineUsers.get(userId);
        sockets.delete(socket.id);
        
        // If all connections closed for this user, they are completely offline
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('userStatusChanged', { userId, isOnline: false });
          console.log(`📣 Broadcasted: ${socket.user.username} is now OFFLINE`);
        }
      }
    });
  });
};

module.exports = { initializeSocket };

