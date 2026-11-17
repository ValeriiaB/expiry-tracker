# Expiry Tracker - App Spec (v1)

## Problem
Long-life food (cans, drinks, dry goods) gets forgotten and expires. Need a super simple phone app: a calendar of expiry dates.

## Platform
- PWA (web app), installed on iPhone via Share > Add to Home Screen (Chrome or Safari).
- Free hosting (GitHub Pages). No App Store, no paid accounts, no extra services.
- Data stored locally on the phone (browser localStorage). No account, no server.

## Screens
1. **Calendar**
   - Month view; dot on days with expiring items.
   - Tap a day: list of items expiring that day.
   - Tap an item: edit / delete.
   - Short "expiring in the next 7 days" strip at the top.
2. **Add item**
   - Two fields: **Name**, **Date**.
   - Each field: type manually OR fill from a photo (camera > on-device OCR, result pre-filled and editable).
   - Save.

## Out of scope (v1)
- Barcode scanning
- Accounts, cloud sync, sharing
- Push notifications (iPhone web apps cannot schedule them without an extra server)

## Reminders
- No push service. Instead, the app highlights items expiring within 7 days when opened.
- Optional: export expiry dates as calendar events (.ics) with a 7-day alert in the iPhone Calendar app.

## Backups
- Weekly backup to a JSON file saved on the phone (Files app / iCloud Drive).
- Constraint: iOS web apps cannot write files silently in the background. Plan: on app open, if the last backup is more than 7 days old, show a one-tap "Back up now" prompt (share sheet > Save to Files).
- Manual "Back up now" and "Restore from file" in a settings screen.
- Backup file includes: items (name, date), settings, timestamp, app version.

## Open questions
- Date format and language (EN / FR)?
