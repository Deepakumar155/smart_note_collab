const Room = require('../models/Room');

module.exports = (io, socket) => {
  // Initialize line locks in memory
  if (!io.lineLocks) io.lineLocks = {};
  
  socket.on('content-change', ({ roomId, filename, content, editLog }) => {
    // Broadcast to others in the room
    socket.to(roomId).emit('content-change', { filename, content });
    
    // Asynchronously save to DB
    Room.findOne({ roomId }).then(room => {
      if (room) {
        const file = room.files.find(f => f.filename === filename);
        if (file) {
          file.content = content;
          file.updatedAt = new Date();
          
          if (editLog) {
            file.editLogs.push({
              editedBy: socket.username || socket.userId,
              lineNumber: editLog.lineNumber,
              oldContent: editLog.oldContent,
              newContent: editLog.newContent,
              timestamp: new Date()
            });
          }
          room.save().catch(err => console.error('Save error on content-change:', err));
        }
      }
    }).catch(err => console.error(err));
  });

  socket.on('notes-change', ({ roomId, filename, notes }) => {
    socket.to(roomId).emit('notes-change', { filename, notes });
    Room.findOne({ roomId }).then(room => {
      if (room) {
        const file = room.files.find(f => f.filename === filename);
        if (file) {
          file.notes = notes;
          room.save().catch(console.error);
        }
      }
    }).catch(console.error);
  });

  socket.on('save-doc', async ({ roomId, filename, content }) => {
    // Explicit save event, might be triggered by Ctrl+S
    try {
      const room = await Room.findOne({ roomId });
      if (room) {
        const file = room.files.find(f => f.filename === filename);
        if (file) {
          file.content = content;
          file.updatedAt = new Date();
          await room.save();
          io.to(roomId).emit('save-doc', { filename, message: 'Saved successfully' });
        }
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Cursor Tracking
  socket.on('cursor-move', ({ roomId, filename, line, column, color }) => {
    const cursorData = {
      userId: socket.userId,
      username: socket.username,
      line,
      column,
      color,
      filename
    };
    socket.to(roomId).emit('cursor-update', cursorData);
  });

  // Line Locking
  // Store format: io.lineLocks[roomId] = { [filename]: { [lineNumber]: { lockedBy: userId, timestamp } } }
  socket.on('line-lock', ({ roomId, filename, line }) => {
    if (!io.lineLocks[roomId]) io.lineLocks[roomId] = {};
    if (!io.lineLocks[roomId][filename]) io.lineLocks[roomId][filename] = {};
    
    // Check if line is already locked by someone else
    const locks = io.lineLocks[roomId][filename];
    if (locks[line] && locks[line].lockedBy !== socket.userId) {
      // Line is locked by someone else, inform the requestor they can't lock
      socket.emit('line-lock-error', { filename, line, message: 'Line is currently locked by another user' });
      return;
    }

    // Lock the line
    locks[line] = {
      lockedBy: socket.userId,
      timestamp: Date.now()
    };

    io.to(roomId).emit('line-lock-broadcast', { filename, locks });
  });

  socket.on('line-unlock', ({ roomId, filename, line }) => {
    if (io.lineLocks[roomId] && io.lineLocks[roomId][filename]) {
      const locks = io.lineLocks[roomId][filename];
      if (locks[line] && locks[line].lockedBy === socket.userId) {
        delete locks[line];
        io.to(roomId).emit('line-lock-broadcast', { filename, locks });
      }
    }
  });
};
