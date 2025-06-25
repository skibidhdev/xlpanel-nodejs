const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config.json');
const db = require('../database');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// GET account page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get user data from database
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.redirect('/login');
    }

    // Get user transactions
    const transactions = await db.getUserTransactions(user.id);

    // Get user data from Pterodactyl
    let pterodactylUser = null;
    try {
      const response = await axios.get(`${config.pterodactyl.domain}/api/application/users/${user.pterodactyl_id}`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });
      pterodactylUser = response.data.attributes;
    } catch (error) {
      console.error('Error fetching Pterodactyl user:', error);
    }

    // Get user servers
    let servers = [];
    try {
      const serversResponse = await axios.get(`${config.pterodactyl.domain}/api/application/servers`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });
      
      servers = serversResponse.data.data.filter(server => 
        server.attributes.user === user.pterodactyl_id
      );
    } catch (error) {
      console.error('Error fetching servers:', error);
    }

    // Calculate resource usage
    const totalCpu = servers.reduce((sum, server) => sum + (server.attributes.limits.cpu || 0), 0);
    const totalMemory = servers.reduce((sum, server) => sum + (server.attributes.limits.memory || 0), 0);
    const totalDisk = servers.reduce((sum, server) => sum + (server.attributes.limits.disk || 0), 0);

    res.render('account', {
      title: 'Account - XLPanel',
      user: req.session.user,
      coins: user.coins,
      isAdmin: user.is_admin,
      name: 'XLPanel',
      userData: {
        username: user.username,
        email: user.email,
        coins: user.coins,
        isAdmin: user.is_admin,
        createdAt: user.created_at,
        pterodactylId: user.pterodactyl_id
      },
      pterodactylUser,
      servers,
      transactions: transactions.slice(0, 10), // Last 10 transactions
      resources: {
        cpu: {
          used: totalCpu,
          limit: config.default?.cpu || 100
        },
        memory: {
          used: totalMemory,
          limit: config.default?.memory || 1024
        },
        disk: {
          used: totalDisk,
          limit: config.default?.disk || 2048
        },
        servers: {
          used: servers.length,
          limit: config.default?.server || 1
        }
      }
    });
  } catch (error) {
    console.error('Account page error:', error);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load account data'
    });
  }
});

// POST update account
router.post('/update', isAuthenticated, async (req, res) => {
  try {
    const { email, currentPassword, newPassword, confirmPassword } = req.body;
    const user = await db.getUser(req.session.user);

    if (!user) {
      return res.redirect('/account?error=User not found');
    }

    // Update email if provided
    if (email && email !== user.email) {
      try {
        await axios.patch(`${config.pterodactyl.domain}/api/application/users/${user.pterodactyl_id}`, {
          email: email
        }, {
          headers: {
            'Authorization': `Bearer ${config.pterodactyl.key}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
          }
        });

        // Update in local database would require adding email update method
        req.session.email = email;
      } catch (error) {
        console.error('Error updating email:', error);
        return res.redirect('/account?error=Failed to update email');
      }
    }

    // Update password if provided
    if (newPassword) {
      if (!currentPassword) {
        return res.redirect('/account?error=Current password is required');
      }

      if (newPassword !== confirmPassword) {
        return res.redirect('/account?error=New passwords do not match');
      }

      if (newPassword.length < 8) {
        return res.redirect('/account?error=Password must be at least 8 characters');
      }

      try {
        await axios.patch(`${config.pterodactyl.domain}/api/application/users/${user.pterodactyl_id}`, {
          password: newPassword
        }, {
          headers: {
            'Authorization': `Bearer ${config.pterodactyl.key}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
          }
        });
      } catch (error) {
        console.error('Error updating password:', error);
        return res.redirect('/account?error=Failed to update password');
      }
    }

    res.redirect('/account?success=Account updated successfully');
  } catch (error) {
    console.error('Account update error:', error);
    res.redirect('/account?error=An unexpected error occurred');
  }
});

module.exports = router;
