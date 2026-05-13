/**
 * FSR Bidding Calculator — Azure App Service Backend v2
 * Node.js + Express + Azure SQL (mssql) + Azure AD SSO
 *
 * All environment variables are stored in Azure Key Vault and surfaced
 * to the App Service via Key Vault references in Application Settings.
 *
 * Required environment variables:
 *   DB_SERVER              e.g. fsr-sql-server.database.windows.net
 *   DB_NAME                e.g. fsr-db
 *   DB_USER                e.g. fsradmin
 *   DB_PASSWORD            (Key Vault reference)
 *   AZURE_TENANT_ID        Directory (tenant) ID from AAD App Registration
 *   AZURE_CLIENT_ID        Application (client) ID from AAD App Registration
 *   AZURE_CLIENT_SECRET    (Key Vault reference) — 24-month expiry, rotate before
 *   SESSION_SECRET         Random 32-char string (Key Vault reference)
 *   ALLOWED_ORIGIN         e.g. https://fsr-bidding-calculator.azurestaticapps.net
 *   TEAMS_WEBHOOK_URL      Incoming webhook URL for approval card routing (Q1 2027)
 *   NODE_ENV               'production' on App Service, 'development' locally
 */

'use strict';

const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const sql      = require('mssql');
const { BearerStrategy } = require('passport-azure-ad');
const passport = require('passport');

const fsrRoutes     = require('./routes/fsr');
const cityRoutes    = require('./routes/cities');
const serviceRoutes = require('./routes/services');
const reportRoutes  = require('./routes/report');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Database connection pool ────────────────────────────────────────────────
const dbConfig = {
  server:   process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options:  { encrypt: true, trustServerCertificate: false },
  pool:     { max: 10, min: 0, idleTimeoutMilliseconds: 30000 }
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(dbConfig);
  return pool;
}
app.locals.getPool = getPool;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 }
}));

// Force HTTPS in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// ── Azure AD Bearer token authentication ─────────────────────────────────────
passport.use(new BearerStrategy({
  identityMetadata:  `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
  clientID:          process.env.AZURE_CLIENT_ID,
  validateIssuer:    true,
  passReqToCallback: false,
  loggingLevel:      process.env.NODE_ENV === 'production' ? 'error' : 'warn'
}, (token, done) => done(null, token)));

app.use(passport.initialize());

// Auth middleware — Bearer token required
const requireAuth   = passport.authenticate('oauth-bearer', { session: false });

// Manager-only middleware — checks AAD role or group claim
const requireManager = [requireAuth, (req, res, next) => {
  const roles = req.user?.roles || [];
  if (!roles.includes('FSR.Manager') && !roles.includes('FSR.Admin')) {
    return res.status(403).json({ error: 'Manager role required.' });
  }
  next();
}];

// ── Routes ───────────────────────────────────────────────────────────────────
// Public (no auth) — data needed before login for initial page load
app.use('/api/cities',   cityRoutes);
app.use('/api/services', serviceRoutes);

// Authenticated — FSR CRUD (any signed-in user)
app.use('/api/fsr',    requireAuth,    fsrRoutes);

// Manager-only — Power BI export, report view, vendor scores
app.use('/api/report', requireManager, reportRoutes);

// Health check for Azure App Service load balancer
app.get('/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  ts: new Date().toISOString()
}));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[FSR API Error]', err.message);
  res.status(500).json({ error: 'An unexpected error occurred.' });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`FSR API v2 running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
});
module.exports = app;
