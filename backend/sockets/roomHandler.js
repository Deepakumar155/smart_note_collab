const Room = require('../models/Room');

module.exports = (io, socket) => {
  // Join a room Document
  socket.on('join-doc', async ({ roomId, password }) => {
    try {
      const room = await Room.findOne({ roomId });
      if (!room) return socket.emit('error-msg', 'Room not found');

      const isMatch = await room.comparePassword(password);
      if (!isMatch) return socket.emit('error-msg', 'Invalid room password');

      socket.join(roomId);
      socket.roomId = roomId;

      if (!io.roomUsers) io.roomUsers = {};
      if (!io.roomUsers[roomId]) io.roomUsers[roomId] = [];
      
      const exists = io.roomUsers[roomId].find(u => u.userId === socket.userId && u.socketId === socket.id);
      if (!exists) {
        io.roomUsers[roomId].push({
          userId: socket.userId,
          username: socket.username,
          socketId: socket.id,
          color: `#${Math.floor(Math.random()*16777215).toString(16)}`
        });
      }

      socket.to(roomId).emit('user-join', { username: socket.username, userId: socket.userId });
      io.to(roomId).emit('room-users', io.roomUsers[roomId]);
      
      if (io.lineLocks && io.lineLocks[roomId]) {
        for (const filename in io.lineLocks[roomId]) {
          const locks = io.lineLocks[roomId][filename];
          if (Object.keys(locks).length > 0) {
            socket.emit('line-lock-broadcast', { filename, locks });
          }
        }
      }
      console.log(`User ${socket.username} joined room ${roomId}`);
    } catch (err) {
      console.error('Join Doc Error:', err);
      socket.emit('error-msg', 'Internal server error');
    }
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
