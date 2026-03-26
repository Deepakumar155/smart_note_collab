const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const roomHandler = require('../sockets/roomHandler');

// Mocking LineLock and Room models to avoid DB dependency in this unit test
jest.mock('../models/Room', () => ({
  findOne: jest.fn().mockResolvedValue({
    roomId: 'stress-room',
    comparePassword: jest.fn().mockResolvedValue(true),
    files: []
  })
}));
jest.mock('../models/LineLock', () => ({
  find: jest.fn().mockResolvedValue([])
}));

describe('Multi-User Active Presence Test', () => {
  let io, httpServer, port;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(() => {
      port = httpServer.address().port;
      io.on('connection', (socket) => {
        // Mock socket auth data
        socket.userId = `user-${socket.id}`;
        socket.username = `User-${socket.id.substring(0, 4)}`;
        roomHandler(io, socket);
      });
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  it('should correctly track 5 concurrent users in a room', (done) => {
    const clients = [];
    const numUsers = 5;
    const roomId = 'stress-room';
    let usersListsReceived = 0;

    const createClient = (index) => {
      const client = new Client(`http://localhost:${port}`);
      clients.push(client);
      
      client.on('connect', () => {
        client.emit('join-doc', { roomId, password: 'any' });
      });

      client.on('room-users', (users) => {
        if (users.length === numUsers) {
          usersListsReceived++;
          // When the last user joins, everyone should see 5 users
          if (usersListsReceived === numUsers) {
            expect(users.length).toBe(numUsers);
            cleanup();
          }
        }
      });
    };

    const cleanup = () => {
      clients.forEach(c => c.close());
      done();
    };

    for (let i = 0; i < numUsers; i++) {
      createClient(i);
    }
  }, 10000);

  it('should handle user reconnection and maintain correct count', (done) => {
    const roomId = 'reconnect-room';
    const client1 = new Client(`http://localhost:${port}`);
    let client2;

    client1.on('connect', () => {
      client1.emit('join-doc', { roomId, password: 'any' });
    });

    client1.on('room-users', (users) => {
      if (users.length === 1 && !client2) {
        // User 1 joined, now join User 2
        client2 = new Client(`http://localhost:${port}`);
        client2.on('connect', () => {
          client2.emit('join-doc', { roomId, password: 'any' });
        });
        
        client2.on('room-users', (users) => {
          if (users.length === 2) {
            // Both joined. Now simulate User 2 disconnection
            client2.disconnect();
          } else if (users.length === 1 && client2 && !client2.connected) {
            // User 2 disconnected, count dropped to 1.
            // Now simulate Reconnection (new socket instance like in a browser refresh)
            const client2Reconnect = new Client(`http://localhost:${port}`);
            client2Reconnect.on('connect', () => {
              // Re-join doc after reconnect (this is the fix we added to Room.jsx)
              client2Reconnect.emit('join-doc', { roomId, password: 'any' });
            });
            
            client2Reconnect.on('room-users', (finalUsers) => {
              if (finalUsers.length === 2) {
                expect(finalUsers.length).toBe(2);
                client1.close();
                client2Reconnect.close();
                done();
              }
            });
          }
        });
      }
    });
  }, 10000);
});
