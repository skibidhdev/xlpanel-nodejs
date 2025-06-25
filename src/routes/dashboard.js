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

// Dashboard GET route
router.get('/', isAuthenticated, async (req, res) => {
  try {
    // Get user data from database
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.redirect('/login');
    }

    // Initialize default values
    let totalResources = { cpu: 0, memory: 0, disk: 0 };
    let serverCount = 0;
    let userServers = [];

    // Try to get user's servers from Pterodactyl if API is available
    try {
      if (user.pterodactyl_id) {
        const response = await axios.get(`${config.pterodactyl.domain}/api/application/servers`, {
          headers: {
            'Authorization': `Bearer ${config.pterodactyl.key}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
          }
        });
        
        const allServers = response.data.data || [];
        userServers = allServers.filter(server => server.attributes.user === user.pterodactyl_id);
        serverCount = userServers.length;

        // Calculate total resource usage from actual servers
        totalResources = userServers.reduce((acc, server) => {
          const limits = server.attributes.limits;
          return {
            cpu: acc.cpu + (limits.cpu || 0),
            memory: acc.memory + (limits.memory || 0),
            disk: acc.disk + (limits.disk || 0)
          };
        }, { cpu: 0, memory: 0, disk: 0 });
      }
    } catch (apiError) {
      console.log('Pterodactyl API not available, using mock data');
      // Use mock data when API is not available
      totalResources = { cpu: 25, memory: 512, disk: 1024 };
      serverCount = 2;
    }

    // Get recent transactions for activity
    let recentTransactions = [];
    try {
      recentTransactions = await db.getRecentTransactions(user.id, 5);
    } catch (error) {
      console.log('Error fetching transactions:', error);
    }

    // Calculate usage percentages based on user's allocated resources
    const userLimits = {
      cpu: user.cpu || config.default.cpu,
      memory: user.ram || config.default.ram,
      disk: user.disk || config.default.disk,
      slots: user.slot || config.default.slot
    };

    const mockData = {
      cpu: {
        used: totalResources.cpu,
        total: userLimits.cpu,
        percentage: Math.round((totalResources.cpu / userLimits.cpu) * 100) || 0
      },
      memory: {
        used: totalResources.memory,
        total: userLimits.memory,
        percentage: Math.round((totalResources.memory / userLimits.memory) * 100) || 0
      },
      disk: {
        used: totalResources.disk,
        total: userLimits.disk,
        percentage: Math.round((totalResources.disk / userLimits.disk) * 100) || 0
      },
      servers: {
        used: serverCount,
        total: userLimits.slots,
        percentage: Math.round((serverCount / userLimits.slots) * 100) || 0
      }
    };

    const dashboardData = {
      title: config.name + ' - Dashboard',
      name: config.name,
      user: user.username,
      email: user.email,
      coins: user.coins,
      isAdmin: user.is_admin,
      mockData: mockData,
      userServers: userServers,
      recentTransactions: recentTransactions,
      bigWel: config.bigWel || `Welcome back, ${user.username}!`,
      smallWel: config.smallWel || 'Manage your servers and resources from your dashboard'
    };

    res.render('dashboard', dashboardData);
  } catch (error) {
    console.error('Dashboard error:', error.message);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load dashboard'
    });
  }
});

module.exports = router;
