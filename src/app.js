const express = require('express');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const axios = require('axios');
const config = require('../config.json');
const db = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure axios defaults for Pterodactyl API
axios.defaults.baseURL = config.pterodactyl.domain;
axios.defaults.headers.common['Authorization'] = `Bearer ${config.pterodactyl.key}`;
axios.defaults.headers.common['Accept'] = 'Application/vnd.pterodactyl.v1+json';
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Global error handler for axios
axios.interceptors.response.use(
  response => response,
  error => {
    console.error('Pterodactyl API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'", config.pterodactyl.domain],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://kit.fontawesome.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com", "https://kit-free.fontawesome.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://kit-free.fontawesome.com"],
      imgSrc: ["'self'", "data:", "https:", config.pterodactyl.domain],
      connectSrc: ["'self'", config.pterodactyl.domain, "https://ka-f.fontawesome.com"],
      frameSrc: ["'self'", config.pterodactyl.domain],
    },
  },
}));

// Request timing middleware
app.use((req, res, next) => {
  req._startTime = Date.now();
  next();
});

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Session middleware with SQLite store
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '../')
  }),
  secret: config.session?.secret || process.env.SESSION_SECRET || 'xlpanel-secret-key',
  name: config.session?.name || 'xlpanel_session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Make config and user data available to all views
app.use(async (req, res, next) => {
  res.locals.config = config;
  res.locals.user = req.session.user;
  res.locals.isAdmin = req.session.isAdmin;
  
  // Get user data from database if logged in
  if (req.session.user) {
    try {
      const user = await db.getUser(req.session.user);
      if (user) {
        res.locals.coin = user.coins;
        res.locals.isAdmin = user.is_admin;
        req.session.coin = user.coins;
        req.session.isAdmin = user.is_admin;
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }
  
  next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Static files
app.use('/assets', express.static(path.join(__dirname, '../panel/assets')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Routes
app.use('/', require('./routes/home'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/login', require('./routes/login'));
app.use('/logout', require('./routes/logout'));
app.use('/register', require('./routes/register'));
app.use('/account', require('./routes/account'));
app.use('/admin', require('./routes/admin'));
app.use('/servers', require('./routes/servers'));
app.use('/store', require('./routes/store'));
app.use('/afk', require('./routes/afk'));
app.use('/panel', require('./routes/panel'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    error: process.env.NODE_ENV === 'development' ? err : {},
    message: 'Internal Server Error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    error: {},
    message: 'Page Not Found'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database initialized`);
});
