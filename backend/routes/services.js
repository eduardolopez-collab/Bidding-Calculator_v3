/**
 * Services route — GET /api/services
 * Public — no auth required. Called on calculator page load.
 * Returns the full service catalog matching the front-end SERVICES[] shape:
 *   { id, cat, sub, unit, low, med, high, travel, ub, sp }
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
        service_id   AS id,
        category     AS cat,
        subtype      AS sub,
        unit,
        price_low    AS low,
        price_medium AS med,
        price_high   AS high,
        travel_cost  AS travel,
        unit_based   AS ub,
        special_flag AS sp
      FROM services
      ORDER BY category ASC, subtype ASC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error('GET /api/services error:', err.message);
    res.status(500).json({ error: 'Failed to load services.' });
  }
});

module.exports = router;
