const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.user = { id: 'mockuser', username: 'testuser' };
  next();
});

// Mock multer
jest.mock('../utils/multerConfig', () => ({
  single: () => (req, res, next) => next()
}));

// Mock Room model
jest.mock('../models/Room');
const Room = require('../models/Room');

const docRoutes = require('../routes/docRoutes');

const app = express();
app.use(express.json());
app.use('/api/docs', docRoutes);

describe('Document API (Mocked)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new room', async () => {
    Room.findOne.mockResolvedValue(null);
    
    // Mock instance behavior
    const mockSave = jest.fn().mockImplementation(function() {
      return Promise.resolve(this);
    });
    
    Room.mockImplementation((data) => ({
      ...data,
      save: mockSave,
      roomId: data.roomId
    }));

    const res = await request(app)
      .post('/api/docs/new')
      .send({ roomId: 'testroom', password: 'roompassword' });
    
    expect(res.statusCode).toEqual(201);
    expect(res.body.roomId).toEqual('testroom');
  });

  it('should not create room with duplicate ID', async () => {
    Room.findOne.mockResolvedValue({ roomId: 'testroom' });

    const res = await request(app)
      .post('/api/docs/new')
      .send({ roomId: 'testroom', password: 'roompassword' });
    
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toEqual('Room ID already exists');
  });

  it('should join an existing room', async () => {
    const mockRoom = {
      roomId: 'testroom',
      files: [],
      createdBy: 'mockuser',
      comparePassword: jest.fn().mockResolvedValue(true)
    };
    Room.findOne.mockResolvedValue(mockRoom);

    const res = await request(app)
      .post('/api/docs/join')
      .send({ roomId: 'testroom', password: 'roompassword' });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.roomId).toEqual('testroom');
  });

  it('should not join with wrong password', async () => {
    const mockRoom = {
      roomId: 'testroom',
      comparePassword: jest.fn().mockResolvedValue(false)
    };
    Room.findOne.mockResolvedValue(mockRoom);

    const res = await request(app)
      .post('/api/docs/join')
      .send({ roomId: 'testroom', password: 'wrongpassword' });
    
    expect(res.statusCode).toEqual(401);
    expect(res.body.message).toEqual('Invalid room password');
  });
});
