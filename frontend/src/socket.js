import { io } from 'socket.io-client';

const socketURL = import.meta.env.VITE_SOCKET_URL || 'https://smart-note-collab.onrender.com';

const socket = io(socketURL, {
  autoConnect: false, // Wait until we explicitly connect when joining a room
  reconnection: true,
  transports: ['websocket', 'polling'] // Try websocket first
});

export default socket;
