/**
 * server.js
 *
 * ldbAfrica Gateway Mock — Express server
 *
 * Serves:
 *   - Backend API routes (JSON)
 *   - Static frontend pages (HTML/HTMX)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');


// Replace your current dotenv line with this:
require('dotenv').config({
  path: path.resolve(__dirname, '../.env')
});


const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// --- API Routes ---
app.use('/initialize', require('./routes/initialize'));
app.use('/verify', require('./routes/verify'));
app.use('/generate-merchant', require('./routes/generate-merchant'));
app.use('/dashboard', require('./routes/dashboard'));

// --- Frontend page routes ---
app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/cart.html'));
});

app.get('/gateway', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/gateway.html'));
});

app.get('/merchant-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- 404 fallback ---
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ldbAfrica Gateway Mock running on http://localhost:${PORT}`);
  console.log(`  Cart:       http://localhost:${PORT}/cart`);
  console.log(`  Dashboard:  http://localhost:${PORT}/merchant-dashboard`);
});

module.exports = app;
