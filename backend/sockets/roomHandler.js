const Room = require('../models/Room');
const LineLock = require('../models/LineLock');

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
      
      // Broadcast active locks for all files in the room
      const activeLocks = await LineLock.find({ roomId });
      const locksByFile = {};
      activeLocks.forEach(l => {
        if (!locksByFile[l.filename]) locksByFile[l.filename] = {};
        locksByFile[l.filename][l.lineNumber] = { 
          lockedBy: l.lockedBy, 
          username: l.username,
          timestamp: l.lockedAt 
        };
      });

      for (const filename in locksByFile) {
        socket.emit('line-lock-broadcast', { filename, locks: locksByFile[filename] });
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

      // Release any locks held by this user in MongoDB
      LineLock.find({ lockedBy: userId, roomId }).then(async (userLocks) => {
        if (userLocks.length > 0) {
          const filesAffected = [...new Set(userLocks.map(l => l.filename))];
          
          await LineLock.deleteMany({ lockedBy: userId, roomId });
          
          // For each affected file, broadcast the new lock state
          for (const filename of filesAffected) {
            const remainingLocks = await LineLock.find({ roomId, filename });
            const locksMap = {};
            remainingLocks.forEach(l => {
              locksMap[l.lineNumber] = { 
                lockedBy: l.lockedBy, 
                username: l.username,
                timestamp: l.lockedAt 
              };
            });
            io.to(roomId).emit('line-lock-broadcast', { filename, locks: locksMap });
          }
          
          io.to(roomId).emit('lines-unlocked', { userId });
        }
      }).catch(err => {
        console.error('Error releasing locks on disconnect:', err);
      });
    }
  });
};
