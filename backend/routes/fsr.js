/**
 * FSR Request routes v2
 *
 * POST /api/fsr        — save a completed FSR with all bids
 * GET  /api/fsr        — list FSRs (filterable, paginated)
 * GET  /api/fsr/:id    — single FSR with all bids
 *
 * v2 changes:
 *   • Accepts benchmark, benchmark_diff, diff_label, bid_count, city_multiplier
 *   • Accepts services as a JSON array (unlimited slots, replaces service1/service2)
 *   • request_date is the CST date string from the front-end (lockRequestDate())
 *   • Vendor bids stored separately in fsr_bids
 */

'use strict';

const express = require('express');
const router  = express.Router();
const sql     = require('mssql');

// ── POST /api/fsr ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const pool = await req.app.locals.getPool();
  const t    = pool.transaction();
  try {
    await t.begin();

    const {
      fsr_number,
      facility_id,
      city_multiplier,
      priority,         // city tier string: 'Low Cost' | 'Mid Cost' | 'High Cost'
      request_date,     // CST date from lockRequestDate(), format MM/DD/YYYY
      description,
      services,         // array of service slot objects (unlimited)
      lowest_bid,
      benchmark,
      benchmark_diff,
      diff_label,
      bid_count,
      approval_status,
      bids              // array of { vendor, amount }
    } = req.body;

    // Validate required fields
    if (!fsr_number || !facility_id || !lowest_bid || !approval_status) {
      await t.rollback();
      return res.status(400).json({ error: 'Missing required fields: fsr_number, facility_id, lowest_bid, approval_status.' });
    }

    // Normalise request_date — accept MM/DD/YYYY or ISO
    let parsedDate;
    if (request_date && request_date.includes('/')) {
      const [m, d, y] = request_date.split('/');
      parsedDate = new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`);
    } else {
      parsedDate = request_date ? new Date(request_date) : new Date();
    }

    const result = await t.request()
      .input('fsr_number',      sql.NVarChar(20),    fsr_number)
      .input('facility_id',     sql.NVarChar(10),    facility_id)
      .input('city_multiplier', sql.Decimal(4,2),    parseFloat(city_multiplier) || 1.00)
      .input('priority',        sql.NVarChar(30),    priority || '')
      .input('request_date',    sql.Date,            parsedDate)
      .input('description',     sql.NVarChar(1000),  description || '')
      .input('services_json',   sql.NVarChar(sql.MAX), JSON.stringify(services || []))
      .input('lowest_bid',      sql.Decimal(10,2),   parseFloat(lowest_bid))
      .input('benchmark',       sql.Decimal(10,2),   parseFloat(benchmark) || 0)
      .input('benchmark_diff',  sql.Decimal(10,2),   parseFloat(benchmark_diff) || 0)
      .input('diff_label',      sql.NVarChar(30),    diff_label || '')
      .input('bid_count',       sql.TinyInt,         parseInt(bid_count) || 1)
      .input('approval_status', sql.NVarChar(50),    approval_status)
      .input('submitted_by',    sql.NVarChar(200),   req.user?.preferred_username || 'unknown')
      .query(`
        INSERT INTO fsr_requests
          (fsr_number, facility_id, city_multiplier, priority, request_date,
           description, services_json, lowest_bid, benchmark, benchmark_diff,
           diff_label, bid_count, approval_status, submitted_by)
        OUTPUT INSERTED.id
        VALUES
          (@fsr_number, @facility_id, @city_multiplier, @priority, @request_date,
           @description, @services_json, @lowest_bid, @benchmark, @benchmark_diff,
           @diff_label, @bid_count, @approval_status, @submitted_by)
      `);

    const newId = result.recordset[0].id;

    // Insert vendor bids
    if (Array.isArray(bids) && bids.length > 0) {
      const amounts = bids.map(b => parseFloat(b.amount));
      const minAmt  = Math.min(...amounts);
      for (const bid of bids) {
        const amt = parseFloat(bid.amount);
        await t.request()
          .input('fsr_request_id', sql.Int,          newId)
          .input('vendor_name',    sql.NVarChar(200), (bid.vendor || 'Unnamed Vendor').trim())
          .input('bid_amount',     sql.Decimal(10,2), amt)
          .input('is_lowest',      sql.Bit,           amt === minAmt ? 1 : 0)
          .query(`
            INSERT INTO fsr_bids (fsr_request_id, vendor_name, bid_amount, is_lowest)
            VALUES (@fsr_request_id, @vendor_name, @bid_amount, @is_lowest)
          `);
      }
    }

    await t.commit();
    res.status(201).json({ id: newId, fsr_number, message: 'FSR saved successfully.' });

  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    console.error('POST /api/fsr error:', err.message);
    // Duplicate FSR number
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `FSR number ${req.body.fsr_number} already exists. Refresh to get the next number.` });
    }
    res.status(500).json({ error: 'Failed to save FSR. Please try again.' });
  }
});

// ── GET /api/fsr ──────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const pool = await req.app.locals.getPool();
    const { city, priority, status, from, to, limit = 200, offset = 0 } = req.query;

    const where = [];
    const r = pool.request();

    if (city)     { where.push('c.city = @city');                r.input('city',     sql.NVarChar, city); }
    if (priority) { where.push('r.priority = @priority');        r.input('priority', sql.NVarChar, priority); }
    if (status)   { where.push('r.approval_status = @status');   r.input('status',   sql.NVarChar, status); }
    if (from)     { where.push('r.request_date >= @from');       r.input('from',     sql.Date,     from); }
    if (to)       { where.push('r.request_date <= @to');         r.input('to',       sql.Date,     to); }

    r.input('limit',  sql.Int, Math.min(parseInt(limit) || 200, 1000));
    r.input('offset', sql.Int, parseInt(offset) || 0);

    const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const result = await r.query(`
      SELECT
        r.id, r.fsr_number, c.city, c.state, c.tier AS pricing_tier,
        r.city_multiplier, r.priority, r.request_date, r.description,
        r.services_json, r.lowest_bid, r.benchmark, r.benchmark_diff AS effort,
        r.diff_label AS effort_label, r.bid_count,
        r.approval_status, r.submitted_by, r.submitted_at,
        (SELECT COUNT(*) FROM fsr_bids b WHERE b.fsr_request_id = r.id) AS vendor_count
      FROM fsr_requests r
      JOIN cities c ON c.facility_id = r.facility_id
      ${clause}
      ORDER BY r.submitted_at DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    res.json({
      data:   result.recordset,
      count:  result.recordset.length,
      offset: parseInt(offset) || 0
    });

  } catch (err) {
    console.error('GET /api/fsr error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve FSRs.' });
  }
});

// ── GET /api/fsr/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const pool = await req.app.locals.getPool();
    const id   = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid FSR id.' });

    const fsr = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT
          r.*, c.city, c.state, c.tier AS pricing_tier, c.cost_multiplier AS db_multiplier
        FROM fsr_requests r
        JOIN cities c ON c.facility_id = r.facility_id
        WHERE r.id = @id
      `);

    if (!fsr.recordset.length) return res.status(404).json({ error: 'FSR not found.' });

    const bids = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT vendor_name, bid_amount, is_lowest FROM fsr_bids WHERE fsr_request_id = @id ORDER BY bid_amount ASC');

    const record = fsr.recordset[0];
    // Parse services_json back to array for the response
    try { record.services = JSON.parse(record.services_json); } catch(_) { record.services = []; }

    res.json({ ...record, bids: bids.recordset });

  } catch (err) {
    console.error('GET /api/fsr/:id error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve FSR.' });
  }
});

module.exports = router;
