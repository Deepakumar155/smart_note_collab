const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/authRoutes');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Mock User model
jest.mock('../models/User');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth API (Mocked)', () => {
  const userData = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should signup a new user', async () => {
    User.findOne.mockResolvedValue(null);
    User.prototype.save = jest.fn().mockResolvedValue({
      id: 'mockid',
      username: userData.username,
      email: userData.email
    });

    const res = await request(app)
      .post('/api/auth/signup')
      .send(userData);
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
  });

  it('should not signup a user with duplicate email', async () => {
    User.findOne.mockResolvedValue({ email: userData.email });

    const res = await request(app)
      .post('/api/auth/signup')
      .send(userData);
    
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toEqual('User already exists with that email or username');
  });

  it('should login an existing user', async () => {
    const mockUser = {
      id: 'mockid',
      username: 'testuser',
      email: userData.email,
      comparePassword: jest.fn().mockResolvedValue(true)
    };
    User.findOne.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });

  it('should not login with wrong password', async () => {
    const mockUser = {
      email: userData.email,
      comparePassword: jest.fn().mockResolvedValue(false)
    };
    User.findOne.mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: userData.email,
        password: 'wrongpassword'
      });
    
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toEqual('Invalid Credentials');
  });
});
