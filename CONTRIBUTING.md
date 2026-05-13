# Contributing to the FSR Bidding Calculator

This is an internal tool maintained by the Facilities & Security team at FlixBus / Greyhound North America. Contributions are currently limited to team members and approved collaborators.

---

## Getting Started

1. Clone the repository
2. Open `frontend/FSR_Calculator_v3.html` in Chrome or Edge
3. Make changes directly to the HTML file — no build step required
4. Test your changes against the scenarios in [BETA_TESTING.md](BETA_TESTING.md)

---

## Branching

| Branch | Purpose |
|---|---|
| `master` | Stable release — do not push directly |
| `dev` | Active development |
| `feature/your-feature-name` | New features |
| `fix/short-description` | Bug fixes |

Always branch off `master` for fixes, `dev` for features. Submit a pull request to merge back.

---

## What to Know Before Editing

- The entire frontend lives in a **single HTML file** — CSS, JS, and HTML are all inline
- Data arrays (`SERVICES`, `CITIES`, `LABOR_RATES`, `MATERIALS`) are declared at the top of the `<script>` block
- Core calculation functions: `recalcResults()`, `buildBreakdown()`, `recalcBreakdown()`, `updateUnitInfo()`
- The print invoice is built by `buildPrintInvoice()` — `BRAND` tokens must be declared before the `allSvcRows` loop
- CSS custom properties (`--tp`, `--tm`, `--bd`, etc.) handle theming — avoid hardcoding colors
- `getCity()` returns a neutral `{laborMult:1, matMult:1}` object when no city is selected — always use this function, never read the select directly

---

## Code Style

- No framework, no transpiler — plain ES6+
- Keep functions focused; avoid adding logic to `recalcResults()` that belongs in a helper
- No comments explaining *what* the code does — only add comments for non-obvious *why*
- CSS: use existing design tokens; do not introduce new hardcoded color values
- Test in both Dark and Light themes before submitting

---

## Pull Request Checklist

- [ ] Tested in Chrome and Edge
- [ ] Tested in both Dark and Light themes
- [ ] No hardcoded colors (use CSS variables)
- [ ] `BRAND` tokens declared before use in `buildPrintInvoice`
- [ ] Print / PDF still renders correctly (Alt+P)
- [ ] FSR Log save and export still work
- [ ] No `.env` files or secrets committed

---

## Questions

Contact Eduardo Lopez — Facilities & Security, FlixBus North America.
