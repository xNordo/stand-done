# stand-done
A firefox extension for Google Meet that lets you check off participants who have already spoken during daily standups.

Adds a tick toggle to every participant in the Meet **People panel** and on **video tiles**.
Both stay in sync. Ticks are kept in memory only, reloading the page clears them (leaving and rejoining without a reload keeps them).

## Development

```bash
npm install
npm test        # jsdom smoke tests
npm run lint    # web-ext lint
npm run build   # dist/stand-done-<version>.xpi
npm start       # launches Firefox with the extension loaded
```

## Installing (temporary)

1. Open `about:debugging#/runtime/this-firefox` (works in Firefox and Zen).
2. *Load Temporary Add-on…* → pick `src/manifest.json` (or the built `.xpi`).
3. Open a Google Meet call.

The extension is unsigned, so it is removed when the browser restarts.
