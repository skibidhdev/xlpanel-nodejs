const express = require('express');
const router = express.Router();

// Home route - redirect to dashboard
router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

module.exports = router;
