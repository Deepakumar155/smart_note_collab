const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const roomHandler = require('../sockets/roomHandler');

describe('Socket.IO API', () => {
  let io, server, clientSocket;
  const port = 4000;

  beforeAll((done) => {
    server = createServer();
    io = new Server(server);
    server.listen(port, () => {
      clientSocket = new Client(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        roomHandler(io, socket);
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    server.close();
    clientSocket.close();
  });

  it('should join a document room and receive user list', (done) => {
    const roomId = 'test-room';
    const username = 'testuser';
    const userId = 'user-123';

    clientSocket.on('room-users', (users) => {
      expect(Array.isArray(users)).toBe(true);
      expect(users.some(u => u.username === username)).toBe(true);
      done();
    });

    clientSocket.emit('join-doc', { roomId, username, userId });
  });

  it('should handle multiple users in a room', (done) => {
    const client2 = new Client(`http://localhost:${port}`);
    const roomId = 'test-room';
    
    client2.on('connect', () => {
      client2.on('room-users', (users) => {
        if (users.length === 2) {
          expect(users.some(u => u.username === 'user2')).toBe(true);
          client2.close();
          done();
        }
      });
      client2.emit('join-doc', { roomId, username: 'user2', userId: 'user-456' });
    });
  });
});
