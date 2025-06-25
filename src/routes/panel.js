const express = require('express');
const router = express.Router();

// Panel GET route
router.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const panelData = {
    title: 'Panel - XLPanel',
    name: 'XLPanel',
    user: req.session.user,
    coin: req.session.coin || 0,
    mIt: {
      'Dashboard': { link: '/dashboard', icon: '<i class="fas fa-tachometer-alt"></i>' },
      'Servers': { link: '/servers', icon: '<i class="fas fa-server"></i>' },
      'Account': { link: '/account', icon: '<i class="fas fa-user"></i>' },
      'Store': { link: '/store', icon: '<i class="fas fa-shopping-cart"></i>' }
    },
    isAdmin: req.session.isAdmin || false,
    request: req,
    serverStats: {
      totalServers: 3,
      runningServers: 2,
      stoppedServers: 1,
      totalResources: {
        cpu: 75,
        ram: 1536,
        disk: 7168
      },
      usedResources: {
        cpu: 45,
        ram: 1024,
        disk: 4096
      }
    }
  };

  res.render('panel', panelData);
});

module.exports = router;
