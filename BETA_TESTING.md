# Beta Testing Guide — FSR Bidding Calculator v3.0

**Version:** 3.0-beta  
**Date:** May 2026  
**Contact:** Eduardo Lopez — Facilities & Security, FlixBus North America

---

## How to Access

1. Download or clone this repository
2. Open `frontend/FSR_Calculator_v3.html` directly in Chrome or Edge (latest version)
3. No installation or internet connection required

---

## How to Submit Feedback

Use GitHub Issues with the provided templates:
- **Bug:** [New Bug Report](../../issues/new?template=bug_report.md)
- **Feature / Improvement:** [New Feature Request](../../issues/new?template=feature_request.md)

For urgent issues, contact Eduardo Lopez directly.

---

## Test Scenarios

Work through these scenarios in order. Each one builds on the previous.

### 1. Basic Setup
- [ ] Open the file in Chrome and Edge — verify it loads correctly in both
- [ ] Toggle Dark / Light theme — verify all elements switch cleanly
- [ ] Enter an FSR number, date, description, and priority
- [ ] Select a city — verify the multiplier subline appears under the city selector

### 2. Single Service — Labor Only
- [ ] Add a service with a single trade (e.g. **Handyman — General Repairs**)
- [ ] Verify Low / Med / High badges appear under Quantity and reflect labor rate card data
- [ ] Change the quantity — verify badges scale correctly
- [ ] Verify the Benchmark card in Pricing Summary matches `rate × qty × city multiplier`
- [ ] Adjust the Workers spinner — verify Labor total in Proposal Summary updates
- [ ] Adjust the Hours spinner — verify Labor total updates

### 3. Single Service — Labor + Travel
- [ ] Select a service that includes travel (travel toggle set to Yes)
- [ ] Verify Travel row appears in Proposal Summary
- [ ] Verify Travel is included in Cost Breakdown right column
- [ ] Change the city — verify Travel cost updates with the city multiplier

### 4. Single Service — Labor + Materials
- [ ] Select a service with pre-determined materials (e.g. **Lighting — LED Tube Retrofit**)
- [ ] Verify materials auto-populate in the Proposal section
- [ ] Delete a pre-determined material — verify it removes cleanly
- [ ] Add a custom material via **+ Add Material**
- [ ] Enter a vendor cost override — verify the cost field turns blue and overrides the benchmark rate
- [ ] Verify Materials total in Proposal Summary reflects all rows

### 5. Cost Breakdown
- [ ] With a full service configured, verify Cost Breakdown shows Labor / Materials / Travel percentages
- [ ] Verify the dominant percentage is white (`--tp`), others are muted
- [ ] Trigger amber on Travel: configure a service where travel > 15% of total — verify amber color
- [ ] Trigger red on Travel: configure travel > 25% — verify red color
- [ ] Verify Action Items appear and match the thresholds that fired

### 6. Multiple Services
- [ ] Add a second service via **+ Add Service**
- [ ] Verify both services appear in the Cost Breakdown right column
- [ ] Verify Combined Total row appears below Pricing Summary cards
- [ ] Verify Adjusted Benchmark reflects totals from both services

### 7. Vendor Bids
- [ ] Add a vendor bid below the benchmark — verify Lowest Bid card turns green
- [ ] Add a vendor bid above the benchmark — verify Lowest Bid card is neutral (no green)
- [ ] Add multiple bids — verify lowest is identified correctly
- [ ] Verify the Effort card shows the correct delta (positive = over, negative = under)

### 8. Approval Engine
- [ ] Submit a bid under benchmark — verify **Auto-Approved** banner appears
- [ ] Submit a bid between benchmark med and high — verify **Senior Agent** approval banner
- [ ] Submit a bid above high benchmark — verify **Senior Manager Escalation** banner

### 9. FSR Log
- [ ] Save a completed FSR — verify it appears in the FSR Log tab
- [ ] Save multiple FSRs — verify they all appear
- [ ] Use the search and filter controls
- [ ] Export to CSV — verify the file downloads and opens correctly in Excel

### 10. Print / Save as PDF
- [ ] With a complete FSR (service + bids), press **Alt+P** or use the menu → Print / Save as PDF
- [ ] Verify the print preview renders (no blank page, no buffering)
- [ ] Verify the invoice includes: header, facility, services table, pricing summary, vendor bids, approval block, and footer
- [ ] Save as PDF and verify the file is readable

---

## Known Limitations in Beta

| Limitation | Notes |
|---|---|
| Data is localStorage only | Clearing browser data erases the FSR Log |
| No authentication | Access control relies on file distribution |
| Single-file app | All data (cities, services, rates) is embedded — changes require editing the HTML |
| No multi-user sync | Two agents working simultaneously cannot see each other's logs |
| Print layout | Tested on A4; letter-size PDF may have minor margin differences |

---

## Out of Scope for Beta

- Azure backend / SQL persistence (planned — see roadmap)
- SharePoint Excel sync
- Role-based access control
- Mobile native app

---

## Browser Support

| Browser | Status |
|---|---|
| Chrome 120+ | Fully supported |
| Edge 120+ | Fully supported |
| Firefox 120+ | Supported (minor font fallback) |
| Safari | Not tested |
| Mobile Chrome | Responsive layout supported; print not tested |
