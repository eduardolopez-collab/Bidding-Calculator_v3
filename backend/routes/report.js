/**
 * Report routes — manager-only (requireManager middleware in server.js)
 *
 * GET /api/report           — flat vw_fsr_report data for Power BI / CSV export
 * GET /api/report/vendors   — vendor reliability scores from vw_vendor_scores
 * POST /api/report/vendors/recalculate — trigger vendor score recomputation
 */

'use strict';

const express = require('express');
const router  = express.Router();
const sql     = require('mssql');

// ── GET /api/report ───────────────────────────────────────────────────────────
// Returns the full vw_fsr_report view, optionally filtered.
// Power BI uses this endpoint in Import mode (scheduled 15-min refresh).
router.get('/', async (req, res) => {
  try {
    const pool = await req.app.locals.getPool();
    const { city, status, from, to, limit = 5000 } = req.query;

    const where = [];
    const r = pool.request();

    if (city)   { where.push('city = @city');             r.input('city',   sql.NVarChar, city); }
    if (status) { where.push('approval_status = @status'); r.input('status', sql.NVarChar, status); }
    if (from)   { where.push('request_date >= @from');    r.input('from',   sql.Date,     from); }
    if (to)     { where.push('request_date <= @to');      r.input('to',     sql.Date,     to); }

    r.input('limit', sql.Int, Math.min(parseInt(limit) || 5000, 10000));

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await r.query(`
      SELECT TOP (@limit) * FROM vw_fsr_report
      ${clause}
      ORDER BY submitted_at DESC
    `);

    res.json({
      data:        result.recordset,
      count:       result.recordset.length,
      generated_at: new Date().toISOString()
    });

  } catch (err) {
    console.error('GET /api/report error:', err.message);
    res.status(500).json({ error: 'Failed to generate report.' });
  }
});

// ── GET /api/report/vendors ───────────────────────────────────────────────────
// Returns all vendor reliability scores (for Power BI Vendor Intelligence dashboard).
router.get('/vendors', async (req, res) => {
  try {
    const pool   = await req.app.locals.getPool();
    const result = await pool.request().query(`
      SELECT * FROM vw_vendor_scores ORDER BY score DESC
    `);
    res.json({ data: result.recordset, count: result.recordset.length });
  } catch (err) {
    console.error('GET /api/report/vendors error:', err.message);
    res.status(500).json({ error: 'Failed to load vendor scores.' });
  }
});

// ── POST /api/report/vendors/recalculate ─────────────────────────────────────
// Triggers immediate vendor score recomputation (normally runs via Azure Function daily).
// Useful for on-demand refresh after a major batch of FSRs.
router.post('/vendors/recalculate', async (req, res) => {
  try {
    const pool = await req.app.locals.getPool();

    // Recompute scores from fsr_bids + fsr_requests joined data
    // This mirrors what the daily Azure Function does, but runs on demand.
    await pool.request().query(`
      MERGE vendor_scores AS target
      USING (
        SELECT
          b.vendor_name,
          COUNT(DISTINCT r.id)                                               AS bid_count,
          -- Win rate: % of FSRs where this vendor had is_lowest = 1
          CAST(SUM(CASE WHEN b.is_lowest = 1 THEN 1 ELSE 0 END) * 100.0
               / NULLIF(COUNT(*), 0) AS DECIMAL(5,2))                        AS win_rate,
          -- Avg effort as % of benchmark
          CAST(AVG(ABS(r.benchmark_diff) * 100.0 / NULLIF(r.benchmark, 0))
               AS DECIMAL(8,2))                                               AS avg_effort_pct,
          -- City coverage
          COUNT(DISTINCT r.facility_id)                                       AS city_count,
          MAX(r.request_date)                                                  AS last_active
        FROM fsr_bids b
        JOIN fsr_requests r ON r.id = b.fsr_request_id
        GROUP BY b.vendor_name
        HAVING COUNT(DISTINCT r.id) >= 5   -- minimum 5 bids to be scored
      ) AS source ON target.vendor_name = source.vendor_name
      WHEN MATCHED THEN UPDATE SET
        bid_count      = source.bid_count,
        win_rate       = source.win_rate,
        avg_effort_pct = source.avg_effort_pct,
        city_count     = source.city_count,
        last_active    = source.last_active,
        -- Score formula (simplified): 100 - avg_effort_pct + win_rate adjustment
        score = LEAST(100, GREATEST(0,
          (100 - COALESCE(source.avg_effort_pct, 50)) * 0.45
          + COALESCE(source.win_rate, 0) * 0.40
          + LEAST(source.city_count, 10) * 1.5
        )),
        tier = CASE
          WHEN LEAST(100, GREATEST(0,
            (100 - COALESCE(source.avg_effort_pct, 50)) * 0.45
            + COALESCE(source.win_rate, 0) * 0.40
            + LEAST(source.city_count, 10) * 1.5
          )) >= 80 THEN 'Tier 1'
          WHEN LEAST(100, GREATEST(0,
            (100 - COALESCE(source.avg_effort_pct, 50)) * 0.45
            + COALESCE(source.win_rate, 0) * 0.40
            + LEAST(source.city_count, 10) * 1.5
          )) >= 60 THEN 'Tier 2'
          WHEN LEAST(100, GREATEST(0,
            (100 - COALESCE(source.avg_effort_pct, 50)) * 0.45
            + COALESCE(source.win_rate, 0) * 0.40
            + LEAST(source.city_count, 10) * 1.5
          )) >= 40 THEN 'Tier 3'
          ELSE 'Tier 4'
        END,
        computed_at = GETUTCDATE()
      WHEN NOT MATCHED THEN INSERT
        (vendor_name, bid_count, win_rate, avg_effort_pct, city_count, last_active, computed_at)
        VALUES (source.vendor_name, source.bid_count, source.win_rate, source.avg_effort_pct,
                source.city_count, source.last_active, GETUTCDATE());
    `);

    res.json({ message: 'Vendor scores recalculated.', ts: new Date().toISOString() });

  } catch (err) {
    console.error('POST /api/report/vendors/recalculate error:', err.message);
    res.status(500).json({ error: 'Failed to recalculate vendor scores.' });
  }
});

module.exports = router;
