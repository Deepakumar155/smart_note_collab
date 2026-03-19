const jwt = require('jsonwebtoken');

/**
 * Socket.io middleware for JWT authentication
 */
module.exports = (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      console.warn(`Unauthenticated socket connection attempt: ${socket.id}`);
      return next(new Error('Authentication error: No token provided'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    // Attach user info to socket
    socket.userId = decoded.user.id;
    socket.username = decoded.user.username;
    
    next();
  } catch (err) {
    console.error(`Socket Auth Error: ${err.message}`);
    return next(new Error('Authentication error: Invalid token'));
  }
};
