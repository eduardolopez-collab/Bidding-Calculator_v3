/**
 * Cities route — GET /api/cities
 * Public — no auth required. Called on calculator page load.
 * Returns all active cities with tier and cost multiplier,
 * matching the front-end CITIES[] data shape exactly.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const sql     = require('mssql');

router.get('/', async (req, res) => {
  try {
    const pool   = await req.app.locals.getPool();
    const result = await pool.request().query(`
      SELECT
        facility_id  AS id,
        city,
        state,
        tier,
        cost_multiplier AS mult
      FROM cities
      ORDER BY city ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/cities error:', err.message);
    res.status(500).json({ error: 'Failed to load cities.' });
  }
});

module.exports = router;
