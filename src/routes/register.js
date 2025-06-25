const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config.json');
const db = require('../database');

// GET register page
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('register', {
    title: config.name + ' - Register',
    name: config.name,
    error: req.query.error
  });
});

// POST register
router.post('/', async (req, res) => {
  try {
    const { username, email, password, confirm_password } = req.body;

    // Basic validation
    if (!username || !email || !password || !confirm_password) {
      return res.redirect('/register?error=All fields are required');
    }

    if (password !== confirm_password) {
      return res.redirect('/register?error=Passwords do not match');
    }

    if (password.length < 8) {
      return res.redirect('/register?error=Password must be at least 8 characters');
    }

    // Check if user already exists in database
    try {
      const existingUser = await db.getUser(username);
      if (existingUser) {
        return res.redirect('/register?error=Username already exists');
      }
    } catch (error) {
      // User doesn't exist, continue
    }

    // Create user in Pterodactyl
    try {
      const response = await axios.post(`${config.pterodactyl.domain}/api/application/users`, {
        email: email,
        username: username,
        first_name: username,
        last_name: 'User',
        password: password,
        root_admin: false,
        language: 'en'
      }, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });

      const pterodactylId = response.data.attributes.id;
      const isAdmin = response.data.attributes.root_admin || false;

      // Create user in local database
      const userId = await db.createUser(username, email, pterodactylId, isAdmin);
      
      // Add initial coins
      const initialCoins = config.default?.coin || 100;
      await db.updateUserCoins(userId, initialCoins);
      await db.addTransaction(userId, initialCoins, 'welcome', 'Welcome bonus');

      // Create session
      req.session.user = username;
      req.session.email = email;
      req.session.pterodactylId = pterodactylId;
      req.session.coin = initialCoins;
      req.session.isAdmin = isAdmin;

      // Log registration
      console.log(`New user registered: ${username} (${email}) - ID: ${userId}`);

      res.redirect('/dashboard');
    } catch (apiError) {
      console.error('Registration error:', apiError.response?.data || apiError.message);
      
      // Handle specific API errors
      if (apiError.response?.data?.errors) {
        const error = apiError.response.data.errors[0];
        if (error.code === 'ValidationException') {
          if (error.meta?.rule === 'unique') {
            if (error.meta?.source_field === 'email') {
              return res.redirect('/register?error=The email has already been taken.');
            }
            if (error.meta?.source_field === 'username') {
              return res.redirect('/register?error=The username has already been taken.');
            }
          }
        }
      }

      res.redirect('/register?error=Failed to create account. Please try again.');
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.redirect('/register?error=An unexpected error occurred');
  }
});

module.exports = router;
