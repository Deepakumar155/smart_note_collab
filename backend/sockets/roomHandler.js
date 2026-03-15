const Room = require('../models/Room');

module.exports = (io, socket) => {
  // Join a room Document
  socket.on('join-doc', async ({ roomId, username, userId }) => {
    socket.join(roomId);

    // Save user info on socket
    socket.roomId = roomId;
    socket.username = username;
    socket.userId = userId;

    // Track room users
    if (!io.roomUsers) io.roomUsers = {};
    if (!io.roomUsers[roomId]) io.roomUsers[roomId] = [];
    
    // Check if user is already in the array
    const exists = io.roomUsers[roomId].find(u => u.userId === userId && u.socketId === socket.id);
    if (!exists) {
      io.roomUsers[roomId].push({
        userId,
        username,
        socketId: socket.id,
        color: `#${Math.floor(Math.random()*16777215).toString(16)}` // Random color for cursor
      });
    }

    // Emit to room that a user joined
    socket.to(roomId).emit('user-join', { username, userId });

    // Send updated user list to everyone in room
    io.to(roomId).emit('room-users', io.roomUsers[roomId]);
    console.log(`User ${username} joined room ${roomId}`);
  });

  socket.on('disconnect', () => {
    const { roomId, userId, username } = socket;
    if (roomId && io.roomUsers[roomId]) {
      // Remove user from room array
      io.roomUsers[roomId] = io.roomUsers[roomId].filter(u => u.socketId !== socket.id);
      
      // Emit to room that user left
      socket.to(roomId).emit('user-leave', { username, userId, socketId: socket.id });
      
      // Update room users list
      io.to(roomId).emit('room-users', io.roomUsers[roomId]);

      // Release any locks held by this user
      if (io.lineLocks && io.lineLocks[roomId]) {
        for (const filename in io.lineLocks[roomId]) {
          const locks = io.lineLocks[roomId][filename];
          for (const line in locks) {
            if (locks[line].lockedBy === userId) {
              delete locks[line];
              io.to(roomId).emit('line-unlock', { filename, line });
              io.to(roomId).emit('line-lock-broadcast', { filename, locks: io.lineLocks[roomId][filename] });
            }
          }
        }
      }
    }
  });
};
