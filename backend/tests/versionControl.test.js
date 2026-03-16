const request = require('supertest');
const express = require('express');

// Mock auth middleware
jest.mock('../middleware/auth', () => (req, res, next) => {
  req.user = { id: 'mockuser', username: 'testuser' };
  next();
});

// Mock Room model
jest.mock('../models/Room');
const Room = require('../models/Room');

const docRoutes = require('../routes/docRoutes');

const app = express();
app.use(express.json());
app.use('/api/docs', docRoutes);

describe('Version Control API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockFile = {
    filename: 'test.js',
    content: 'original content',
    versions: [],
    editLogs: [],
    save: jest.fn().mockResolvedValue(true)
  };

  const mockRoom = {
    roomId: 'testroom',
    files: [mockFile],
    save: jest.fn().mockResolvedValue(true)
  };

  it('should save a new version', async () => {
    Room.findOne.mockResolvedValue(mockRoom);
    
    const res = await request(app)
      .post('/api/docs/testroom/version')
      .send({ filename: 'test.js', content: 'new content' });
    
    expect(res.statusCode).toEqual(201);
    expect(res.body.message).toEqual('Version saved successfully');
    expect(mockFile.versions.length).toBe(1);
    expect(mockFile.versions[0].content).toBe('new content');
  });

  it('should get versions for a file', async () => {
    mockFile.versions = [{ content: 'v1', savedBy: 'user1', timestamp: new Date() }];
    Room.findOne.mockResolvedValue(mockRoom);

    const res = await request(app)
      .get('/api/docs/testroom/versions/test.js');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].content).toBe('v1');
  });

  it('should restore a version', async () => {
    const versionId = 'v1_id';
    mockFile.versions = [{ 
      _id: versionId, 
      content: 'previous content', 
      savedBy: 'user1', 
      timestamp: new Date() 
    }];
    // Mocking the .id() method on mongoose arrays
    mockFile.versions.id = jest.fn().mockReturnValue(mockFile.versions[0]);
    
    Room.findOne.mockResolvedValue(mockRoom);

    const res = await request(app)
      .post('/api/docs/testroom/restore-version')
      .send({ filename: 'test.js', versionId });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.message).toEqual('Version restored');
    expect(res.body.content).toBe('previous content');
    expect(mockFile.content).toBe('previous content');
  });

  it('should get edit logs for a file', async () => {
    mockFile.editLogs = [{ editedBy: 'user1', lineNumber: 5, oldContent: 'a', newContent: 'b', timestamp: new Date() }];
    Room.findOne.mockResolvedValue(mockRoom);

    const res = await request(app)
      .get('/api/docs/testroom/logs/test.js');
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].newContent).toBe('b');
  });
});
