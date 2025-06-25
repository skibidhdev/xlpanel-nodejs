const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config.json');
const db = require('../database');

// GET login page
router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    title: config.name + ' - Login',
    name: config.name,
    error: req.query.error
  });
});

// POST login
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Basic validation
    if (!username || !password) {
      return res.redirect('/login?error=Username and password are required');
    }

    // Check if user exists in local database
    let localUser;
    try {
      localUser = await db.getUser(username);
    } catch (error) {
      console.error('Database error:', error);
    }

    // Try to authenticate with Pterodactyl
    try {
      // Get user from Pterodactyl
      const usersResponse = await axios.get(`${config.pterodactyl.domain}/api/application/users`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });

      const pterodactylUser = usersResponse.data.data.find(u => 
        u.attributes.username.toLowerCase() === username.toLowerCase()
      );

      if (!pterodactylUser) {
        return res.redirect('/login?error=Invalid username or password');
      }

      // Try to authenticate by creating a temporary API key
      try {
        const authResponse = await axios.post(`${config.pterodactyl.domain}/api/client/account/api-keys`, {
          description: 'XLPanel Login Test',
          allowed_ips: []
        }, {
          headers: {
            'Authorization': `Bearer ${config.pterodactyl.key}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
          }
        });

        // Authentication successful
        const userData = pterodactylUser.attributes;

        // Create or update user in local database
        if (!localUser) {
          try {
            const userId = await db.createUser(
              userData.username, 
              userData.email, 
              userData.id, 
              userData.root_admin || false
            );
            
            // Add initial coins for new users
            const initialCoins = config.default?.coin || 100;
            await db.updateUserCoins(userId, initialCoins);
            await db.addTransaction(userId, initialCoins, 'welcome', 'Welcome bonus');
            
            localUser = await db.getUser(userData.username);
          } catch (dbError) {
            console.error('Error creating local user:', dbError);
            // Continue with session creation even if database fails
          }
        }

        // Set session data
        req.session.user = userData.username;
        req.session.email = userData.email;
        req.session.pterodactylId = userData.id;
        req.session.coin = localUser ? localUser.coins : (config.default?.coin || 0);
        req.session.isAdmin = userData.root_admin || false;

        // Log login
        console.log(`User logged in: ${userData.username}`);

        // Redirect to dashboard
        res.redirect('/dashboard');
      } catch (authError) {
        console.error('Authentication error:', authError.response?.data || authError.message);
        res.redirect('/login?error=Invalid username or password');
      }
    } catch (apiError) {
      console.error('Login error:', apiError.response?.data || apiError.message);
      res.redirect('/login?error=Failed to authenticate. Please try again.');
    }
  } catch (error) {
    console.error('Login error:', error);
    res.redirect('/login?error=An unexpected error occurred');
  }
});

module.exports = router;
