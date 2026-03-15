const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

// @route   POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      return res.status(400).json({ message: 'User already exists with that email or username' });
    }

    user = new User({ username, email, password });
    await user.save();

    const payload = { user: { id: user.id, username: user.username } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.status(201).json({ token, user: { id: user.id, username, email } });
      }
    );
  } catch (error) {
    console.error('SIGNUP ERROR:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server Error', error: error.message, stack: error.stack });
    }
  }
});

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id, username: user.username } };
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: { id: user.id, username: user.username, email } });
      }
    );
  } catch (error) {
    console.error('LOGIN ERROR detail:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server Error', error: error.message, stack: error.stack });
    }
  }
});

module.exports = router;
