const mongoose = require('mongoose');

const lineLockSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true
  },
  filename: {
    type: String,
    required: true
  },
  lineNumber: {
    type: Number,
    required: true
  },
  lockedBy: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  lockedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index to quickly find/remove specific line locks
lineLockSchema.index({ roomId: 1, filename: 1, lineNumber: 1 }, { unique: true });
// Index for cleaning up on user disconnect
lineLockSchema.index({ lockedBy: 1 });

module.exports = mongoose.model('LineLock', lineLockSchema);
