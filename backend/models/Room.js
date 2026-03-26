const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  files: [{
    filename: String,
    language: String,
    content: String,
    notes: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
    editLogs: [{
      editedBy: String,
      lineNumber: Number,
      oldContent: String,
      newContent: String,
      timestamp: { type: Date, default: Date.now }
    }],
    versions: [{
      content: String,
      savedBy: String,
      timestamp: { type: Date, default: Date.now }
    }]
  }]
}, { timestamps: true });

roomSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw error;
  }
});

roomSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Room', roomSchema);
