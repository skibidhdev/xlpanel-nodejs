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

// GET store page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's current resources from Pterodactyl
    let currentResources = {
      cpu: 0,
      memory: 0,
      disk: 0,
      servers: 0
    };

    try {
      const serversResponse = await axios.get(`${config.pterodactyl.domain}/api/application/servers`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });
      
      const userServers = serversResponse.data.data.filter(server => 
        server.attributes.user === user.pterodactyl_id
      );

      currentResources.servers = userServers.length;
      currentResources.cpu = userServers.reduce((sum, server) => sum + (server.attributes.limits.cpu || 0), 0);
      currentResources.memory = userServers.reduce((sum, server) => sum + (server.attributes.limits.memory || 0), 0);
      currentResources.disk = userServers.reduce((sum, server) => sum + (server.attributes.limits.disk || 0), 0);
    } catch (error) {
      console.error('Error fetching user resources:', error);
    }

    // Store items with prices from config
    const storeItems = [
      {
        id: 'cpu',
        name: 'CPU',
        description: `${config.store.cpu[1]}% CPU Core`,
        price: config.store.cpu[0],
        amount: config.store.cpu[1],
        icon: 'fas fa-microchip',
        current: currentResources.cpu,
        unit: '%'
      },
      {
        id: 'ram',
        name: 'Memory',
        description: `${config.store.ram[1]}MB RAM`,
        price: config.store.ram[0],
        amount: config.store.ram[1],
        icon: 'fas fa-memory',
        current: currentResources.memory,
        unit: 'MB'
      },
      {
        id: 'disk',
        name: 'Disk Space',
        description: `${config.store.disk[1]}MB Storage`,
        price: config.store.disk[0],
        amount: config.store.disk[1],
        icon: 'fas fa-hdd',
        current: currentResources.disk,
        unit: 'MB'
      },
      {
        id: 'slot',
        name: 'Server Slot',
        description: 'Additional Server',
        price: config.store.slot[0],
        amount: config.store.slot[1],
        icon: 'fas fa-server',
        current: currentResources.servers,
        unit: 'slots'
      }
    ];

    res.render('store', {
      title: 'Store - XLPanel',
      user: req.session.user,
      coins: user.coins,
      isAdmin: user.is_admin,
      name: 'XLPanel',
      storeItems,
      currentResources,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Store page error:', error);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load store'
    });
  }
});

// POST purchase item
router.post('/purchase', isAuthenticated, async (req, res) => {
  try {
    const { item, quantity = 1 } = req.body;
    const user = await db.getUser(req.session.user);

    if (!user) {
      return res.redirect('/login');
    }

    // Get store prices and amounts from config
    const storeConfig = {
      cpu: { price: config.store.cpu[0], amount: config.store.cpu[1] },
      ram: { price: config.store.ram[0], amount: config.store.ram[1] },
      disk: { price: config.store.disk[0], amount: config.store.disk[1] },
      slot: { price: config.store.slot[0], amount: config.store.slot[1] }
    };

    if (!storeConfig[item]) {
      return res.redirect('/store?error=Invalid item');
    }

    const totalPrice = storeConfig[item].price * quantity;
    const totalAmount = storeConfig[item].amount * quantity;

    // Check if user has enough coins
    if (user.coins < totalPrice) {
      return res.redirect('/store?error=Insufficient coins');
    }

    // Get user's servers to update resources
    try {
      const serversResponse = await axios.get(`${config.pterodactyl.domain}/api/application/servers`, {
        headers: {
          'Authorization': `Bearer ${config.pterodactyl.key}`,
          'Content-Type': 'application/json',
          'Accept': 'Application/vnd.pterodactyl.v1+json'
        }
      });
      
      const userServers = serversResponse.data.data.filter(server => 
        server.attributes.user === user.pterodactyl_id
      );

      if (item === 'slot') {
        // For server slots, we don't update existing servers
        // This would require creating a new server or updating user limits
        // For now, we'll just deduct coins and log the purchase
        await db.updateUserCoins(user.id, -totalPrice);
        await db.addTransaction(user.id, -totalPrice, 'purchase', `Purchased ${quantity} server slot(s)`);
        
        return res.redirect('/store?success=Server slot purchased! You can now create additional servers.');
      } else {
        // Update existing servers with additional resources
        for (const server of userServers) {
          const currentLimits = server.attributes.limits;
          const newLimits = { ...currentLimits };

          switch (item) {
            case 'cpu':
              newLimits.cpu = (currentLimits.cpu || 0) + totalAmount;
              break;
            case 'ram':
              newLimits.memory = (currentLimits.memory || 0) + totalAmount;
              break;
            case 'disk':
              newLimits.disk = (currentLimits.disk || 0) + totalAmount;
              break;
          }

          // Update server in Pterodactyl
          await axios.patch(`${config.pterodactyl.domain}/api/application/servers/${server.attributes.id}/build`, {
            limits: newLimits,
            feature_limits: server.attributes.feature_limits
          }, {
            headers: {
              'Authorization': `Bearer ${config.pterodactyl.key}`,
              'Content-Type': 'application/json',
              'Accept': 'Application/vnd.pterodactyl.v1+json'
            }
          });
        }

        // Deduct coins and log transaction
        await db.updateUserCoins(user.id, -totalPrice);
        await db.addTransaction(user.id, -totalPrice, 'purchase', `Purchased ${totalAmount}${item === 'cpu' ? '%' : 'MB'} ${item}`);

        // Update session
        req.session.coin = user.coins - totalPrice;

        res.redirect(`/store?success=Successfully purchased ${totalAmount}${item === 'cpu' ? '%' : 'MB'} ${item}!`);
      }
    } catch (apiError) {
      console.error('Pterodactyl API error:', apiError.response?.data || apiError.message);
      res.redirect('/store?error=Failed to update resources. Please contact support.');
    }
  } catch (error) {
    console.error('Purchase error:', error);
    res.redirect('/store?error=An unexpected error occurred');
  }
});

module.exports = router;
