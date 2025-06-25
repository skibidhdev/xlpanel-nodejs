const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config.json');

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.isAdmin) {
    return res.redirect('/login');
  }
  next();
};

// Admin GET route
router.get('/', requireAdmin, async (req, res) => {
  try {
    // Get all users from Pterodactyl
    const usersResponse = await axios.get('/api/application/users');
    const users = usersResponse.data.data || [];

    // Get all servers
    const serversResponse = await axios.get('/api/application/servers');
    const servers = serversResponse.data.data || [];

    // Calculate system statistics
    const totalUsers = users.length;
    const totalServers = servers.length;
    const totalResources = servers.reduce((acc, server) => {
      const limits = server.attributes.limits;
      return {
        cpu: acc.cpu + (limits.cpu || 0),
        ram: acc.ram + (limits.memory || 0),
        disk: acc.disk + (limits.disk || 0)
      };
    }, { cpu: 0, ram: 0, disk: 0 });

    const adminData = {
      title: config.name + ' - Admin Panel',
      name: config.name,
      user: req.session.user,
      coin: req.session.coin || 0,
      totalUsers,
      totalServers,
      totalResources,
      mIt: {
        'Dashboard': { link: '/dashboard', icon: '<i class="fas fa-tachometer-alt"></i>' },
        'Servers': { link: '/servers', icon: '<i class="fas fa-server"></i>' },
        'Account': { link: '/account', icon: '<i class="fas fa-user"></i>' },
        'Store': { link: '/store', icon: '<i class="fas fa-shopping-cart"></i>' }
      },
      isAdmin: true,
      request: req,
      users: users.map(user => ({
        id: user.attributes.id,
        username: user.attributes.username,
        email: user.attributes.email,
        servers: servers.filter(s => s.attributes.user === user.attributes.id).length,
        coin: user.attributes.coin || 0
      })),
      servers: servers.map(server => ({
        id: server.attributes.id,
        name: server.attributes.name,
        owner: users.find(u => u.attributes.id === server.attributes.user)?.attributes.username || 'Unknown',
        status: server.attributes.status || 'unknown',
        cpu: server.attributes.limits.cpu,
        ram: server.attributes.limits.memory,
        disk: server.attributes.limits.disk
      }))
    };

    res.render('admin', adminData);
  } catch (error) {
    console.error('Admin panel error:', error.response?.data || error.message);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load admin panel'
    });
  }
});

// Delete user
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete user's servers first
    const serversResponse = await axios.get(`/api/application/users/${id}/servers`);
    const servers = serversResponse.data.data || [];
    
    for (const server of servers) {
      await axios.delete(`/api/application/servers/${server.attributes.id}`);
    }
    
    // Delete the user
    await axios.delete(`/api/application/users/${id}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('User deletion error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

// Delete server
router.delete('/servers/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await axios.delete(`/api/application/servers/${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Server deletion error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete server'
    });
  }
});

// Update user
router.patch('/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    await axios.patch(`/api/application/users/${id}`, updateData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('User update error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

module.exports = router;
