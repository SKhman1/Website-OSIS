# Aspirations roadmap

## Current decision — 3 October 2026

Use a native website form backed by Google Forms. Respondent link:
https://forms.gle/oX6GDK8YqjM5HfzW7

The three questions were verified from the published respondent page. Code for
the website, submission API, and owner-installed Apps Script is prepared.
Submission stays closed until the owner deploys/authorizes the script, configures
secrets and Turnstile, and completes an explicitly labelled end-to-end test.
Owner steps are in `integrations/google-forms/SETUP.md`.

Staff view results in Google Forms/Sheets. No custom database, staff web
dashboard, desktop executable, WhatsApp/Telegram bot, or monthly scheduler is
part of this phase. The legacy SQLite scaffold remains unused by this flow.

## Deferred notifications

WhatsApp remains a possible future addition if the council later needs it and
has a sender number and approved account/templates. If monthly notifications
are added, only send a previous-calendar-month report when there is at least
one aspiration, with month boundaries in Asia/Jakarta. Never send empty reports.
No automated messages or recurring automation have been enabled.
