# Changelog

All notable changes to the FSR Bidding Calculator are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [3.0.0-beta] — 2026-05-12

### Added
- **225 services** across 20+ categories (Electrical, Plumbing, HVAC, Lighting, Roofing, Pavement, Flooring, Access Points, Fire Systems, Landscaping, Pest Removal, Restroom Renovation, and more)
- **55 cities** with individual labor and material cost multipliers across Low / Mid / High cost tiers
- **Labor Rate Card** — 15 trades (Handyman, Electrician, Welder, Plumber, HVAC Tech, Painter, Flooring Installer, Roofer, Landscaper, Pest Control, Glazier, Locksmith, Concrete Worker, General Laborer, Traffic Control)
- **190 materials** with Low / Med / High unit pricing across all service categories
- **Service container** split into Benchmark and Proposal sections
- **Workers spinner** per trade — multiplies into labor proposal total
- **Three-way cost split** — Labor% / Travel% / Materials% with descending font-size scaling
- **Bid Intelligence block** — primary cost driver diagnosis + 14 conditional action flags
- **Action Items section** with amber/red severity coloring aligned to cost breakdown thresholds
- **Cost Breakdown color coding** — Travel (>15% amber, >25% red), Labor (>70% amber, >85% red), Materials (>65% amber, >80% red)
- **Static Benchmark card** — market rate × city multiplier × quantity; unaffected by proposal spinners
- **Adjusted Benchmark card** — live DOM totals reflecting proposal changes
- **Travel row** in Proposal Summary and Cost Breakdown right column
- **City multiplier** applied to travel cost across all calculation paths
- **Lowest Bid color** — green when ≤ benchmark, neutral when over
- **Responsive metric cards** — 4-column desktop, 2-column tablet, 1-column mobile
- Print / Save as PDF via `window.print()` with brand-formatted invoice
- FSR Log with localStorage persistence, search, filter, and CSV export
- Dark / Light theme toggle
- Keyboard shortcuts (Alt+B, Alt+S, Alt+P, Alt+C)

### Fixed
- City multiplier defaulting to first real city instead of neutral (1.0×) when no city selected
- Labor and materials not updating when service category changed
- Pre-determined materials not auto-populating on service selection
- Low/Med/High badges showing only one trade's rate card data
- Workers spinner showing decimal values (now integer-only)
- Native browser spinner arrows visible inside custom spin wrapper
- `buildPrintInvoice` using `BRAND` tokens before they were declared — caused silent crash and blank/hanging print preview

### Changed
- Labor + Travel total in Proposal Summary split into two separate rows
- Driver sentences shortened to diagnosis only; actionable items moved to Action Items list
- Benchmark card is now static (qty + city only); Adjusted Benchmark reflects live proposal

---

## [2.x] — Internal prototype

Earlier internal versions not tracked in this repository.

---

## Roadmap

See `docs/FSR_12Month_Product_Roadmap.docx` for the full planned feature timeline, including Azure SQL backend, SharePoint sync, and multi-user support.
