const Room = require('../models/Room');
const LineLock = require('../models/LineLock');

// Debounce map for database saves: Map<roomId:filename, timeoutId>
const saveDebounce = new Map();
// Map to store pending edit logs: Map<roomId:filename, log[]>
const pendingLogs = new Map();

module.exports = (io, socket) => {
  
  socket.on('content-change', ({ roomId, filename, content, editLog }) => {
    // SECURITY FIX: Enforce line locks
    if (editLog && editLog.lineNumber !== undefined) {
      const line = editLog.lineNumber;
      
      // Check MongoDB for lock
      LineLock.findOne({ roomId, filename, lineNumber: line }).then(lock => {
        if (lock && lock.lockedBy !== socket.userId) {
          console.warn(`Unauthorized edit attempt: User ${socket.username} on locked line ${line}`);
          socket.emit('line-lock-error', { filename, line, message: 'You do not have permission to edit this line' });
          return;
        }
        
        // Broadcast to everyone in the room (EXCEPT sender)
        socket.to(roomId).emit('content-change', { filename, content });
      }).catch(err => {
        console.error('Error checking line lock:', err);
      });
    } else {
      // If no line number, just broadcast (e.g. major content replace)
      socket.to(roomId).emit('content-change', { filename, content });
    }
    
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
        if (!room) {
          console.warn(`Room ${roomId} not found for debounced save.`);
          return;
        }

        const file = room.files.find(f => f.filename === filename);
        if (!file) {
          console.warn(`File ${filename} not found in room ${roomId} for debounced save.`);
          return;
        }

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
        console.log(`[DEBUG] Debounced save successful for ${debounceKey}`);
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
  socket.on('line-lock', async ({ roomId, filename, line }) => {
    console.log(`Line lock request: Room ${roomId}, File ${filename}, Line ${line} by ${socket.userId}`);
    
    try {
      // Check if line is already locked by someone else
      const existingLock = await LineLock.findOne({ roomId, filename, lineNumber: line });
      if (existingLock && existingLock.lockedBy !== socket.userId) {
        socket.emit('line-lock-error', { filename, line, message: 'Line is currently locked by another user' });
        return;
      }

      if (!existingLock) {
        await LineLock.create({
          roomId,
          filename,
          lineNumber: line,
          lockedBy: socket.userId,
          username: socket.username
        });
      }

      // Fetch all active locks for this file to broadcast
      const allLocks = await LineLock.find({ roomId, filename });
      const locksMap = {};
      allLocks.forEach(l => {
        locksMap[l.lineNumber] = { 
          lockedBy: l.lockedBy, 
          username: l.username,
          timestamp: l.lockedAt 
        };
      });

      io.to(roomId).emit('line-lock-broadcast', { filename, locks: locksMap });
    } catch (err) {
      console.error('Line lock error:', err);
      socket.emit('error-msg', 'Failed to lock line');
    }
  });

  socket.on('line-unlock', async ({ roomId, filename, line }) => {
    try {
      await LineLock.deleteOne({ roomId, filename, lineNumber: line, lockedBy: socket.userId });
      
      // Fetch all remaining locks for this file to broadcast
      const allLocks = await LineLock.find({ roomId, filename });
      const locksMap = {};
      allLocks.forEach(l => {
        locksMap[l.lineNumber] = { lockedBy: l.lockedBy, timestamp: l.lockedAt };
      });

      io.to(roomId).emit('line-lock-broadcast', { filename, locks: locksMap });
    } catch (err) {
      console.error('Line unlock error:', err);
    }
  });
};

module.exports.saveDebounce = saveDebounce;
module.exports.pendingLogs = pendingLogs;
