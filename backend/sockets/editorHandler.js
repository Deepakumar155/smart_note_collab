const Room = require('../models/Room');

// Debounce map for database saves: Map<roomId:filename, timeoutId>
const saveDebounce = new Map();
// Map to store pending edit logs: Map<roomId:filename, log[]>
const pendingLogs = new Map();

module.exports = (io, socket) => {
  // Initialize line locks in memory if not already done
  if (!io.lineLocks) io.lineLocks = {};
  
  socket.on('content-change', ({ roomId, filename, content, editLog }) => {
    // Broadcast to everyone in the room (including sender) to keep all state in sync
    io.to(roomId).emit('content-change', { filename, content });
    
    const debounceKey = `${roomId}:${filename}`;
    
    // Accumulate log if provided
    if (editLog) {
      if (!pendingLogs.has(debounceKey)) {
        pendingLogs.set(debounceKey, []);
      }
      pendingLogs.get(debounceKey).push({
        editedBy: socket.username || socket.userId || 'Anonymous',
        lineNumber: editLog.lineNumber,
        oldContent: editLog.oldContent,
        newContent: editLog.newContent,
        timestamp: new Date()
      });
    }

    if (saveDebounce.has(debounceKey)) {
      clearTimeout(saveDebounce.get(debounceKey));
    }

    // Set a timer to save to DB after a pause in typing
    const timeoutId = setTimeout(async () => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) return;

        const file = room.files.find(f => f.filename === filename);
        if (!file) return;

        file.content = content;
        file.updatedAt = new Date();
        
        // Add all accumulated logs
        const logs = pendingLogs.get(debounceKey) || [];
        if (logs.length > 0) {
          file.editLogs.push(...logs);
          pendingLogs.delete(debounceKey);
          // Notify the room that new logs are available
          io.to(roomId).emit('log-update', { filename, logs: file.editLogs });
        }
        
        await room.save();
        saveDebounce.delete(debounceKey);
      } catch (err) {
        console.error('Debounced save error:', err);
      }
    }, 1500); // Increased slightly to catch more changes in a burst

    saveDebounce.set(debounceKey, timeoutId);
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

module.exports.saveDebounce = saveDebounce;
module.exports.pendingLogs = pendingLogs;
