# drinkcloudly.com

Coming soon page for Cloudly, hosted on Cloudflare Pages.

- `public/` is the website (no build step). Pages setting: build command empty, build output directory `public`.
- `functions/api/subscribe.js` saves launch-list signups in a D1 database bound as `DB`.
- `functions/api/export.js` downloads the list as CSV at `/api/export?key=...` when the secret `EXPORT_KEY` is set.
- `functions/api/submit.js` saves community photo submissions (from /community and /community-en) in the same D1 database (`submissions` table). The page shrinks photos to max 1600 px JPEG before upload.
- `functions/api/submissions.js` shows the submissions as a private gallery at `/api/submissions?key=...` (same `EXPORT_KEY` secret), with download and delete per photo.
