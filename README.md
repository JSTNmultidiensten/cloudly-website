# drinkcloudly.com

Coming soon page for Cloudly, hosted on Cloudflare Pages.

- `public/` is the website (no build step). Pages setting: build command empty, build output directory `public`.
- `functions/api/subscribe.js` saves launch-list signups in a D1 database bound as `DB`.
- `functions/api/export.js` downloads the list as CSV at `/api/export?key=...` when the secret `EXPORT_KEY` is set.
