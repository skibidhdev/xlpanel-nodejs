const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../../config.json');

router.get('/', async (req, res) => {
  try {
    // If user has a Pterodactyl session, try to revoke their API key
    if (req.session.pterodactylId) {
      try {
        await axios.delete(`${config.pterodactyl.domain}/api/client/account/api-keys`, {
          headers: {
            'Authorization': `Bearer ${config.pterodactyl.key}`,
            'Content-Type': 'application/json',
            'Accept': 'Application/vnd.pterodactyl.v1+json'
          }
        });
      } catch (apiError) {
        console.error('Failed to revoke API key:', apiError.response?.data || apiError.message);
        // Continue with logout even if API key revocation fails
      }
    }

    // Log the logout
    if (req.session.user) {
      console.log(`User logged out: ${req.session.user}`);
    }

    // Destroy the session
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destruction error:', err);
      }
      // Clear the session cookie
      res.clearCookie(config.session?.name || 'xlpanel_session');
      // Redirect to login page
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Logout error:', error);
    // If there's an error, still try to destroy the session and redirect
    req.session.destroy(() => {
      res.clearCookie(config.session?.name || 'xlpanel_session');
      res.redirect('/login');
    });
  }
});

module.exports = router;
