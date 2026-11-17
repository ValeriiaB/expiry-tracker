# Expiry Tracker

Simple phone app: a calendar of food and drink expiry dates.

- Calendar with dots on days where something expires; tap a day to see items.
- Add item: **Name** and **Date**, each typed or read from a photo (OCR runs on the phone).
- Items expiring within 7 days (or already expired) are highlighted at the top.
- Weekly backup prompt: saves a JSON file to Files; restore from the Backup tab.
- Optional export to the iPhone Calendar with a 7-day alert.
- All data stays on the phone. No account, no server, free.

## Install on iPhone
Open the app URL, tap the Share button, then **Add to Home Screen**.

## Develop
Static files only. Run `python3 -m http.server` in this folder and open http://localhost:8000.
When you change files, bump `VERSION` in `sw.js`.

See [SPEC.md](SPEC.md) for the full spec.
