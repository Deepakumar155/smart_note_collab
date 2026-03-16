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

// Middleware to inject io into req object
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://Deepak:DEEPAK1552005@cluster0.ao1yeyg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
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
  console.log('User connected:', socket.id);

  setupRoomHandlers(io, socket);
  setupEditorHandlers(io, socket);
  setupExecutionHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
