# Security Policy

## Scope

This tool is an **internal-only** Facilities & Security productivity application for FlixBus / Greyhound North America. It is not publicly accessible and does not process personal data or payment information.

## Supported Versions

| Version | Supported |
|---|---|
| v3.x (current) | Yes |
| v2.x and below | No |

## Data Handling

| Data Type | Where It Lives | Notes |
|---|---|---|
| FSR log entries | Browser `localStorage` only | Never transmitted externally |
| Vendor bid amounts | Browser session memory | Not persisted after tab close |
| Labor / material rate data | Embedded in HTML file | Static, read-only |
| City multipliers | Embedded in HTML file | Static, read-only |

**No data is sent to any external server in the current frontend-only version.**

The planned Azure backend (`backend/`) will introduce SQL persistence — a separate security review should be conducted before that layer is deployed.

## Reporting a Vulnerability

If you discover a security issue in this tool, please **do not open a public GitHub issue**.

Contact the Facilities & Security team directly:

- **Primary:** Eduardo Lopez — Facilities & Security, FlixBus North America
- **IT Security escalation:** Follow the standard FlixBus internal security incident process

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment

You can expect an acknowledgement within **2 business days**.

## Known Limitations (Beta)

- All data is stored in `localStorage` — clearing browser data will erase the FSR log
- No authentication layer in the frontend-only version; access control relies on network/distribution restrictions
- The `.env` file in `backend/` contains credential placeholders — ensure it is never populated and committed to version control (covered by `.gitignore`)
