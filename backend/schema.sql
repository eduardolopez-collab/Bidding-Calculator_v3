-- ============================================================
-- FSR Bidding Calculator — Azure SQL Database Schema v2
-- Post-beta. Run once against your Azure SQL database.
-- ============================================================

-- ── Cities (synced nightly from Excel via Azure Function) ──────────────────
CREATE TABLE cities (
    facility_id     NVARCHAR(10)   NOT NULL PRIMARY KEY,   -- FAC-001 … FAC-056
    city            NVARCHAR(100)  NOT NULL,
    state           NCHAR(2)       NOT NULL,
    tier            NVARCHAR(20)   NOT NULL,               -- Low Cost / Mid Cost / High Cost
    cost_multiplier DECIMAL(4,2)   NOT NULL,
    notes           NVARCHAR(500)  NULL,
    last_synced     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- ── Services / Bidding Matrix (synced nightly from Excel) ──────────────────
CREATE TABLE services (
    service_id      NVARCHAR(10)   NOT NULL PRIMARY KEY,   -- SVC-001 … SVC-244+
    category        NVARCHAR(100)  NOT NULL,
    subtype         NVARCHAR(200)  NOT NULL,
    unit            NVARCHAR(50)   NOT NULL,
    price_low       DECIMAL(10,2)  NOT NULL,
    price_medium    DECIMAL(10,2)  NOT NULL,
    price_high      DECIMAL(10,2)  NOT NULL,
    travel_cost     DECIMAL(10,2)  NOT NULL DEFAULT 0,
    unit_based      BIT            NOT NULL DEFAULT 0,
    special_flag    NVARCHAR(50)   NULL,                   -- Cameras / Signage / Pest
    scope_notes     NVARCHAR(500)  NULL,
    last_synced     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- ── FSR Requests (one row per submitted FSR) ────────────────────────────────
-- v2 changes vs original:
--   • priority          → now stores city tier string (Low Cost / Mid Cost / High Cost)
--   • urgency_level     → new: user-selected Low / Medium / High per service slot
--   • benchmark         → new: adjusted benchmark total at submission time
--   • benchmark_diff    → new: lowest_bid minus benchmark (negative = savings)
--   • diff_label        → new: 'Under benchmark' or 'Over benchmark'
--   • bid_count         → new: number of vendor bids submitted
--   • services stored as JSON array → replaces fixed service1/service2 columns,
--     supports unlimited cascading services as added in the front-end
--   • removed hard-coded service1_*/service2_* columns (breaking change — fresh DB)
CREATE TABLE fsr_requests (
    id              INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    fsr_number      NVARCHAR(20)   NOT NULL UNIQUE,        -- YYYY-NNN e.g. 2026-001
    facility_id     NVARCHAR(10)   NOT NULL REFERENCES cities(facility_id),
    city_multiplier DECIMAL(4,2)   NOT NULL,               -- snapshot of multiplier at submission
    priority        NVARCHAR(30)   NOT NULL,               -- city tier: Low Cost / Mid Cost / High Cost
    request_date    DATE           NOT NULL,               -- CST date at submission (America/Chicago)
    description     NVARCHAR(1000) NOT NULL,
    services_json   NVARCHAR(MAX)  NOT NULL,               -- JSON array of service slots (unlimited)
    lowest_bid      DECIMAL(10,2)  NOT NULL,
    benchmark       DECIMAL(10,2)  NOT NULL,               -- adjusted benchmark at submission
    benchmark_diff  DECIMAL(10,2)  NOT NULL,               -- lowest_bid - benchmark
    diff_label      NVARCHAR(30)   NOT NULL,               -- 'Under benchmark' | 'Over benchmark'
    bid_count       TINYINT        NOT NULL DEFAULT 1,
    approval_status NVARCHAR(50)   NOT NULL,               -- Auto-approved / Senior Agent / Senior Manager / Special Approval
    submitted_by    NVARCHAR(200)  NOT NULL,               -- AAD UPN (email)
    submitted_at    DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
    updated_at      DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- ── FSR Bids (one row per vendor bid) ──────────────────────────────────────
CREATE TABLE fsr_bids (
    id              INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    fsr_request_id  INT            NOT NULL REFERENCES fsr_requests(id) ON DELETE CASCADE,
    vendor_name     NVARCHAR(200)  NOT NULL,
    bid_amount      DECIMAL(10,2)  NOT NULL,
    is_lowest       BIT            NOT NULL DEFAULT 0,
    created_at      DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX idx_fsr_city       ON fsr_requests(facility_id);
CREATE INDEX idx_fsr_priority   ON fsr_requests(priority);
CREATE INDEX idx_fsr_date       ON fsr_requests(request_date);
CREATE INDEX idx_fsr_status     ON fsr_requests(approval_status);
CREATE INDEX idx_fsr_submitted  ON fsr_requests(submitted_by);
CREATE INDEX idx_fsr_fsr_number ON fsr_requests(fsr_number);
CREATE INDEX idx_bids_request   ON fsr_bids(fsr_request_id);

-- ── Power BI reporting view ─────────────────────────────────────────────────
-- Flat table consumed directly by Power BI (Import mode, 15-min refresh).
-- Never write to this view. Point Power BI to vw_fsr_report only.
CREATE VIEW vw_fsr_report AS
SELECT
    r.id                                                        AS request_id,
    r.fsr_number,
    c.city,
    c.state,
    c.tier                                                      AS pricing_tier,
    r.city_multiplier,
    r.priority,                                                 -- city tier label (display)
    r.request_date,
    FORMAT(r.request_date, 'MMMM')                             AS request_month,
    YEAR(r.request_date)                                        AS request_year,
    DATEPART(quarter, r.request_date)                           AS request_quarter,
    r.description,
    r.services_json,                                            -- full service detail for drill-through
    r.lowest_bid,
    r.benchmark,
    r.benchmark_diff                                            AS effort,
    r.diff_label                                                AS effort_label,
    r.bid_count,
    r.approval_status,
    CASE r.approval_status
        WHEN 'Auto-approved'    THEN 1
        WHEN 'Senior Agent'     THEN 2
        WHEN 'Senior Manager'   THEN 3
        WHEN 'Special Approval' THEN 4
        ELSE 5
    END                                                         AS approval_level,
    r.submitted_by,
    r.submitted_at,
    -- Vendor columns (from fsr_bids)
    (SELECT STRING_AGG(b.vendor_name, ' | ')
     FROM fsr_bids b WHERE b.fsr_request_id = r.id)            AS vendors,
    (SELECT STRING_AGG(b.vendor_name + ': $' + CAST(CAST(b.bid_amount AS INT) AS NVARCHAR), ' | ')
     FROM fsr_bids b WHERE b.fsr_request_id = r.id)            AS all_bids_detail,
    (SELECT COUNT(*)    FROM fsr_bids b WHERE b.fsr_request_id = r.id) AS bid_count_check,
    (SELECT MIN(b.bid_amount) FROM fsr_bids b WHERE b.fsr_request_id = r.id) AS lowest_bid_amount,
    (SELECT MAX(b.bid_amount) FROM fsr_bids b WHERE b.fsr_request_id = r.id) AS highest_bid_amount
FROM fsr_requests r
JOIN cities c ON c.facility_id = r.facility_id;

-- ── Vendor Reliability Scorecard (Q4 2026 feature) ─────────────────────────
-- Populated daily by an Azure Function. Agents and Power BI read from vw_vendor_scores.
CREATE TABLE vendor_scores (
    id              INT            NOT NULL IDENTITY(1,1) PRIMARY KEY,
    vendor_name     NVARCHAR(200)  NOT NULL,
    score           DECIMAL(5,2)   NOT NULL DEFAULT 0,         -- 0–100
    tier            NVARCHAR(20)   NOT NULL DEFAULT 'Tier 4',  -- Tier 1–4
    bid_count       INT            NOT NULL DEFAULT 0,
    win_rate        DECIMAL(5,2)   NULL,                       -- % first-bid wins
    rebid_rate      DECIMAL(5,2)   NULL,                       -- % lowered after pushback
    avg_effort_pct  DECIMAL(8,2)   NULL,                       -- avg |diff| / benchmark %
    city_count      INT            NULL,                       -- distinct cities
    last_active     DATE           NULL,                       -- last bid date
    computed_at     DATETIME2      NOT NULL DEFAULT GETUTCDATE()
);
CREATE UNIQUE INDEX idx_vendor_scores_name ON vendor_scores(vendor_name);

CREATE VIEW vw_vendor_scores AS
SELECT
    vendor_name,
    score,
    tier,
    bid_count,
    win_rate,
    rebid_rate,
    avg_effort_pct,
    city_count,
    last_active,
    computed_at,
    CASE tier
        WHEN 'Tier 1' THEN 'Preferred'
        WHEN 'Tier 2' THEN 'Acceptable'
        WHEN 'Tier 3' THEN 'Marginal'
        WHEN 'Tier 4' THEN 'At Risk'
        ELSE 'Unscored'
    END AS tier_label
FROM vendor_scores;
