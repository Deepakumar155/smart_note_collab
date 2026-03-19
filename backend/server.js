const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
  process.exit(1);
});

dotenv.config();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.IO Setup
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    methods: ["GET", "POST"]
  }
});

// Socket Authentication Middleware
const socketAuth = require('./middleware/socketAuth');
io.use(socketAuth);

// Basic Rate Limiting for Sockets
const rateLimits = new Map(); // socketId -> { count, startTime }
const MAX_EVENTS_PER_SEC = 50;

// Middleware to inject io into req object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database Connection
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error('CRITICAL: MONGODB_URI is not defined in .env');
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/docs', require('./routes/docRoutes'));

// Socket handlers
const setupRoomHandlers = require('./sockets/roomHandler');
const setupEditorHandlers = require('./sockets/editorHandler');
const setupExecutionHandlers = require('./sockets/executionHandler');

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.username} (${socket.userId})`);

  // Initialize rate limiting for this socket
  rateLimits.set(socket.id, { count: 0, startTime: Date.now() });

  // Middleware for every event on this socket to prevent spam
  socket.use(([event, ...args], next) => {
    const limit = rateLimits.get(socket.id);
    if (!limit) return next();
    
    const now = Date.now();
    
    if (now - limit.startTime > 1000) {
      limit.count = 1;
      limit.startTime = now;
    } else {
      limit.count++;
    }

    if (limit.count > MAX_EVENTS_PER_SEC) {
      console.warn(`Rate limit exceeded for user ${socket.username}. Disconnecting.`);
      socket.emit('error-msg', 'Exceeded rate limit. Disconnecting.');
      return socket.disconnect(true);
    }
    next();
  });

  setupRoomHandlers(io, socket);
  setupEditorHandlers(io, socket);
  setupExecutionHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.username);
    rateLimits.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
