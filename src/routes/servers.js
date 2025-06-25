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

// GET servers page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.redirect('/login');
    }

    let servers = [];
    let hasServers = false;

    try {
      // Get user's servers from Pterodactyl
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
      hasServers = servers.length > 0;
    } catch (error) {
      console.error('Error fetching servers:', error.response?.data || error.message);
    }

    // Get available eggs from config
    const availableEggs = Object.keys(config.eggs).map(key => ({
      id: key,
      name: config.eggs[key].name,
      info: config.eggs[key].info
    }));

    // Get available nodes from config
    const availableNodes = Object.keys(config.locations).map(key => ({
      id: key,
      name: config.locations[key].name
    }));

    res.render('servers', {
      title: 'Servers - XLPanel',
      user: req.session.user,
      coins: user.coins,
      isAdmin: user.is_admin,
      name: 'XLPanel',
      servers,
      hasServers,
      availableEggs,
      availableNodes,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Servers page error:', error);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load servers'
    });
  }
});

// POST create server
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { name, cpu, memory, disk, node, egg } = req.body;
    const user = await db.getUser(req.session.user);

    if (!user) {
      return res.redirect('/login');
    }

    // Validate inputs
    if (!name || !cpu || !memory || !disk || !node || !egg) {
      return res.redirect('/servers?error=All fields are required');
    }

    // Check if egg exists in config
    if (!config.eggs[egg]) {
      return res.redirect('/servers?error=Invalid egg selected');
    }

    // Check if node exists in config
    if (!config.locations[node]) {
      return res.redirect('/servers?error=Invalid node selected');
    }

    const eggInfo = config.eggs[egg].info;

    try {
      // Get available allocations for the node
      const allocationsResponse = await axios.get(`${config.pterodactyl.domain}/api/application/nodes/${node}/allocations`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });

      const availableAllocations = allocationsResponse.data.data.filter(alloc => !alloc.attributes.assigned);
      
      if (availableAllocations.length === 0) {
        return res.redirect('/servers?error=No available ports on selected node');
      }

      const allocation = availableAllocations[0];

      // Create server in Pterodactyl
      const serverData = {
        name: name,
        user: user.pterodactyl_id,
        egg: eggInfo.egg,
        docker_image: eggInfo.docker_image,
        startup: eggInfo.startup,
        environment: eggInfo.environment,
        limits: {
          memory: parseInt(memory),
          swap: 0,
          disk: parseInt(disk),
          io: 500,
          cpu: parseInt(cpu)
        },
        feature_limits: eggInfo.feature_limits || {
          databases: 0,
          backups: 0
        },
        allocation: {
          default: allocation.attributes.id
        }
      };

      const response = await axios.post(`${config.pterodactyl.domain}/api/application/servers`, serverData, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });

      // Log server creation
      await db.addTransaction(user.id, 0, 'server_created', `Server "${name}" created successfully`);

      console.log(`Server created: ${name} for user ${user.username}`);
      res.redirect('/servers?success=Server created successfully!');
    } catch (apiError) {
      console.error('Server creation error:', apiError.response?.data || apiError.message);
      
      if (apiError.response?.data?.errors) {
        const error = apiError.response.data.errors[0];
        return res.redirect(`/servers?error=${error.detail || 'Failed to create server'}`);
      }

      res.redirect('/servers?error=Failed to create server. Please try again.');
    }
  } catch (error) {
    console.error('Server creation error:', error);
    res.redirect('/servers?error=An unexpected error occurred');
  }
});

// POST delete server
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const serverId = req.params.id;
    const user = await db.getUser(req.session.user);

    if (!user) {
      return res.redirect('/login');
    }

    try {
      // Delete server from Pterodactyl
      await axios.delete(`${config.pterodactyl.domain}/api/application/servers/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });

      // Log server deletion
      await db.addTransaction(user.id, 0, 'server_deleted', `Server deleted successfully`);

      console.log(`Server ${serverId} deleted by user ${user.username}`);
      res.redirect('/servers?success=Server deleted successfully!');
    } catch (apiError) {
      console.error('Server deletion error:', apiError.response?.data || apiError.message);
      res.redirect('/servers?error=Failed to delete server');
    }
  } catch (error) {
    console.error('Server deletion error:', error);
    res.redirect('/servers?error=An unexpected error occurred');
  }
});

module.exports = router;
