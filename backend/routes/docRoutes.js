const express = require('express');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const auth = require('../middleware/auth');
const upload = require('../utils/multerConfig');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Helper to deduce language based on extension
const getLanguage = (filename) => {
  const ext = filename.split('.').pop();
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) return 'javascript';
  if (['py'].includes(ext)) return 'python';
  if (['html'].includes(ext)) return 'html';
  if (['css'].includes(ext)) return 'css';
  return 'plaintext';
};

// @route   POST /api/docs/new
router.post('/new', auth, async (req, res) => {
  console.log('ROOM CREATION REQUEST:', { body: req.body, user: req.user?.id });
  try {
    const { roomId, password, initialFile } = req.body;

    let room = await Room.findOne({ roomId });
    if (room) {
      console.warn('ROOM CREATION CONFLICT:', roomId);
      return res.status(400).json({ message: 'Room ID already exists' });
    }

    const filename = initialFile || 'index.js';
    const language = getLanguage(filename);

    room = new Room({
      roomId,
      password,
      createdBy: req.user.id,
      files: [{
        filename,
        language,
        content: `// Start coding in ${filename}\n`,
        notes: ''
      }]
    });

    await room.save();
    res.status(201).json({ message: 'Room created successfully', roomId: room.roomId });
  } catch (error) {
    console.error('ROOM CREATION ERROR:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
});

// @route   POST /api/docs/join
router.post('/join', auth, async (req, res) => {
  try {
    const { roomId, password } = req.body;

    const room = await Room.findOne({ roomId });
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const isMatch = await room.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid room password' });
    }

    // Return room details minus hashed password
    res.json({
      roomId: room.roomId,
      files: room.files,
      createdBy: room.createdBy
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/docs/:roomId/upload
router.post('/:roomId/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const content = fs.readFileSync(req.file.path, 'utf8');
    const filename = req.file.originalname;

    // Check for duplicate filename
    if (room.files.some(f => f.filename === filename)) {
      return res.status(400).json({ message: 'File already exists in room' });
    }

    const newFile = {
      filename,
      language: getLanguage(filename),
      content,
      notes: ''
    };

    room.files.push(newFile);
    await room.save();

    // Clean up uploaded physical file since it's stored in DB now
    fs.unlinkSync(req.file.path);

    res.status(201).json({ message: 'File uploaded successfully', file: newFile });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/docs/:roomId/download/:filename
router.get('/:roomId/download/:filename', auth, async (req, res) => {
  try {
    const { roomId, filename } = req.params;
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'text/plain');
    res.send(file.content);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/docs/:roomId/version
router.post('/:roomId/version', auth, async (req, res) => {
  try {
    const { filename, content } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const version = {
      content,
      savedBy: req.user.username || req.user.id,
      timestamp: new Date()
    };

    file.versions.push(version);
    await room.save();

    res.status(201).json({ message: 'Version saved successfully', version });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/docs/:roomId/versions/:filename
router.get('/:roomId/versions/:filename', auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === req.params.filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    res.json(file.versions);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/docs/:roomId/restore-version
router.post('/:roomId/restore-version', auth, async (req, res) => {
  try {
    const { filename, versionId } = req.body; // or content
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    const versionToRestore = file.versions.id(versionId);
    if (!versionToRestore) return res.status(404).json({ message: 'Version not found' });

    file.content = versionToRestore.content;
    file.updatedAt = new Date();
    await room.save();

    // Broadcast the restored content to the room using the io instance saved in req
    if (req.io) {
      req.io.to(room.roomId).emit('content-change', {
        filename: filename,
        content: file.content
      });
    }

    res.json({ message: 'Version restored', content: file.content });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/docs/:roomId/logs/:filename
router.get('/:roomId/logs/:filename', auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === req.params.filename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    res.json(file.editLogs);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   POST /api/docs/:roomId/files/create
router.post('/:roomId/files/create', auth, async (req, res) => {
  try {
    const { filename } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    if (room.files.some(f => f.filename === filename)) {
      return res.status(400).json({ message: 'File already exists' });
    }

    const newFile = {
      filename,
      language: getLanguage(filename),
      content: `// New file: ${filename}\n`,
      notes: ''
    };

    room.files.push(newFile);
    await room.save();

    if (req.io) {
      req.io.to(room.roomId).emit('file-created', { file: newFile });
    }

    res.status(201).json({ message: 'File created successfully', file: newFile });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   PUT /api/docs/:roomId/files/rename
router.put('/:roomId/files/rename', auth, async (req, res) => {
  try {
    const { oldFilename, newFilename } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const file = room.files.find(f => f.filename === oldFilename);
    if (!file) return res.status(404).json({ message: 'File not found' });

    if (room.files.some(f => f.filename === newFilename)) {
      return res.status(400).json({ message: 'Target filename already exists' });
    }

    file.filename = newFilename;
    file.language = getLanguage(newFilename);
    await room.save();

    if (req.io) {
      req.io.to(room.roomId).emit('file-renamed', { oldFilename, newFilename });
    }

    res.json({ message: 'File renamed successfully', oldFilename, newFilename });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE /api/docs/:roomId/files/delete
router.delete('/:roomId/files/delete', auth, async (req, res) => {
  try {
    const { filename } = req.body;
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ message: 'Room not found' });

    room.files = room.files.filter(f => f.filename !== filename);
    await room.save();

    if (req.io) {
      req.io.to(room.roomId).emit('file-deleted', { filename });
    }

    res.json({ message: 'File deleted successfully', filename });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
