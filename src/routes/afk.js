const express = require('express');
const router = express.Router();
const db = require('../database');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// AFK page
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.redirect('/login');
    }

    res.render('afk', {
      title: 'AFK Farm - XLPanel',
      user: req.session.user,
      coins: user.coins,
      isAdmin: user.is_admin,
      name: 'XLPanel'
    });
  } catch (error) {
    console.error('AFK page error:', error);
    res.status(500).render('error', {
      error: {},
      message: 'Failed to load AFK page'
    });
  }
});

// Start AFK session
router.post('/start', isAuthenticated, async (req, res) => {
  try {
    const user = await db.getUser(req.session.user);
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const sessionId = await db.startAfkSession(user.id);
    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Start AFK session error:', error);
    res.status(500).json({ success: false, error: 'Failed to start AFK session' });
  }
});

// End AFK session
router.post('/end', isAuthenticated, async (req, res) => {
  try {
    const { sessionId, duration } = req.body;
    const user = await db.getUser(req.session.user);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Calculate coins earned (5 coins per 120 seconds)
    const durationInSeconds = Math.floor(duration / 1000);
    const intervals = Math.floor(durationInSeconds / 120);
    const coinsEarned = intervals * 5;

    if (coinsEarned > 0) {
      // Update session and user coins
      await db.endAfkSession(sessionId, coinsEarned);
      await db.updateUserCoins(user.id, coinsEarned);
      await db.addTransaction(user.id, coinsEarned, 'afk', 'AFK farming reward');

      // Update session coins
      req.session.coin = (req.session.coin || 0) + coinsEarned;
    }

    res.json({ 
      success: true, 
      coinsEarned,
      totalCoins: user.coins + coinsEarned,
      duration: durationInSeconds
    });
  } catch (error) {
    console.error('End AFK session error:', error);
    res.status(500).json({ success: false, error: 'Failed to end AFK session' });
  }
});

module.exports = router;
