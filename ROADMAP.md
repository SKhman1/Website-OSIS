# Deferred work

## Native aspirations and WhatsApp notifications

Deferred at the user's request on 2 October 2026. The form remains closed.

- Store accepted, validated aspirations in a persistent database.
- Prefer WhatsApp notifications to opted-in OSIS reviewers through the official
  WhatsApp Business Platform; Telegram is an optional alternative.
- Notify reviewers of a new aspiration with an ID/category and authenticated
  dashboard link. Keep the full submission in the dashboard.
- Prepare a previous-calendar-month report using Asia/Jakarta boundaries.
- Send a monthly report only when that month has at least one aspiration.
  A zero-submission month must produce no WhatsApp report.
- Schedule monthly processing using a separate Cloudflare Worker.
- Keep submission storage independent of notification delivery, with retries
  and duplicate prevention for notifications/reports.

Before implementation, configure the sender account, opted-in recipient(s),
approved message templates, persistent storage, and staff authentication.
No account setup, notification delivery, or monthly scheduler is enabled yet.
