# Demo corpus: Warren Buffett shareholder letters

This directory contains short, illustrative excerpts from Warren Buffett's annual letters to Berkshire Hathaway
shareholders. They are used only to demonstrate the 6-step workflow end-to-end; researchers conducting actual
studies should fetch the full letters directly from the primary source below.

**Primary source:** https://www.berkshirehathaway.com/letters/letters.html

**Licensing:** The letters are public corporate disclosures. Redistribution here is limited to excerpts for
non-commercial educational/demo purposes. Do not redistribute full copies through this repository.

## Files

- `index.json` — corpus manifest read by the demo loader.
- `brk-YYYY.txt` — one plain-text excerpt per selected year. These are seeded with short placeholder text so the
  workflow clicks through; replace with full text locally (fetched from the URL above) before running any
  substantive analysis.

## To replace with full letters locally (for a real run)

```bash
cd apps/web/public/demo/buffett
# Fetch the real letters with your browser or a script, save each as brk-YYYY.txt.
```

Then load the Buffett demo project in the app.
