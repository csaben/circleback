# circleback

Circle part of your running site, type what you mean, press Enter. Your coding agent gets the note with the exact element you circled, fixes the code, hot reload shows the change, and the agent's reply pops up on the page.

- **Works with any dev server:** Next, Vite, Astro, SvelteKit, Rails, Django, anything that serves HTML. circleback is a small proxy in front of it, so your project's code is never touched.
- **No dependencies.** One Node script and one overlay file.
- **Hot reload passes through**, including WebSockets.

## Use it with Claude Code

Install the plugin once:

```
/plugin marketplace add csaben/circleback
/plugin install circleback@circleback
```

Then in any web project: *"start circleback"*. Claude starts the proxy and watches for notes.

## Use it with any other agent

Point the agent at this repo and say: *"follow skills/circleback/SKILL.md in github.com/csaben/circleback"*. The skill file is plain instructions.

## Run it yourself

```bash
npx -y github:csaben/circleback --target http://localhost:3000   # your dev server
# open http://localhost:3999, press ` (backtick) or the pink ✎ button
```

| Command | What it does |
|---|---|
| `circleback [--target URL] [--port 3999] [--host 127.0.0.1] [--builder URL] [--public-url URL]` | Proxy with the overlay injected |
| `circleback watch` | Print each new note as one JSON line (for agent monitors) |
| `circleback reply <id> <message> [--agent NAME] [--session ID]` | Show a reply toast on the page for that note |
| `circleback --trace ...` | Also record traces for a training dataset (see below) |
| `circleback export [--out FILE]` | Write traced notes as JSONL episodes |

All commands take `--dir` (default `.circleback`). That folder holds `inbox.jsonl` and `replies.jsonl` and ignores itself in git.

## Build it for your phone (optional)

Point circleback at an APK build server and the overlay grows a 📱 button:

```bash
CIRCLEBACK_BUILDER=http://127.0.0.1:7400 npx -y github:csaben/circleback --target http://localhost:3000
# or: --builder http://127.0.0.1:7400
```

The loop: open circleback in your phone's Chrome over the tailnet, edit by circling, and when you like it tap 📱 and pick what to build:

| Kind | What you get |
|---|---|
| **Live** | A tiny app that opens this circleback page. Edits show up instantly and ✎ works inside the app. Needs the tailnet. |
| **Bundled** | The built site packed inside (Capacitor). Works offline. |
| **Native** | An Expo, React Native or Android project, built as is. |

📱 packs up the folder circleback runs in (what git sees, plus root `.env*` files) and uploads it to the builder, which can be this machine or any other you can reach. The panel shows progress, then a QR code. The APK is served **through circleback**, so the phone only ever needs to reach circleback's address, and the QR points at the project's *latest* build, so it keeps working after every rebuild. Each project is its own app; rebuilding updates it in place.

Every app keeps a way back to the editor that doesn't depend on your web code: long-press the app icon → **Edit in circleback**, and a native fallback screen with **Open editor** if the page fails to load. A broken app is always one tap from being fixed.

If the project isn't an app yet, the panel offers **Make it an app** (Capacitor) or **Port to native**, which send your agent a note. If a build fails, **Ask agent to fix** sends it a link to the build log.

Circleback needs to know how your phone reaches it. When you open the page over the tailnet it uses that address; otherwise pass `--public-url https://<machine>.<tailnet>.ts.net:3999` (or `CIRCLEBACK_PUBLIC_URL`).

### Builder API

A builder is any server with this API. The page only talks to the proxy, which relays these calls.

| Call | |
|---|---|
| `POST /api/builds/upload?name=&host=&kind=&edit=&git=` | Body: the project as .tar.gz. `kind` is `live`, `bundled` or `native`. `edit` is circleback's phone-reachable address (may be missing). Returns the build as JSON, or 404 when there is nothing of that kind to build. |
| `GET /api/builds/:id` | `{ id, status: queued\|running\|success\|failed\|cancelled, step, projectName, versionName, startedAt }` |
| `GET /api/builds/:id/log.txt` | Build log |
| `POST /api/builds/:id/cancel` | |
| `GET /api/builds/:id/app.apk` | That build's APK |
| `GET /api/apps/latest.apk?name=&host=` | The newest successful APK for that project |
| `GET /qr.svg?u=` | QR code for a URL |

What a builder should do with `kind` and `edit`:

- One app per `name` + `host`: a stable package id and one signing key, so a rebuild installs over the old one.
- **live**: a WebView shell that loads `edit`. No web build needed, so it should take seconds.
- **bundled**: Capacitor with the built web output inside.
- **native**: build the Expo / React Native / Android project that is there; 404 if there is none.
- Every kind, when `edit` is set: a launcher shortcut **Edit in circleback** that opens `edit` in the browser, and a native error screen (load failure, crash on start) with **Open editor** and **Retry**. Both live in the native layer so they work when the web code is broken.

## What a note contains

The note text, the page URL and title, viewport, scroll position, theme, the circled box (viewport and page coordinates), the element at the centre of the circle, and up to eight outermost elements inside it, each with tag, id, classes, a short CSS path, text and a few useful attributes.

Every note also saves a **snapshot**: a script-free copy of the page as it looked when you started drawing, with styles copied in and hover/focus states pinned. The note's `snapshotFile` points at it in `.circleback/snapshots/`.

## Traces

Every circleback round is a labelled example of your taste: what you pointed at, what you asked for, what the agent changed, and whether it landed. Start the proxy with `--trace` (or `CIRCLEBACK_TRACE=1`) to keep them, whichever agent is doing the work.

- When a note arrives, the project's working tree is recorded as a git tree. A scratch index is used, so your staging area is never touched.
- When the agent runs `reply`, the code diff for that note is recorded. If it passes `--agent` and `--session` (or sets `CIRCLEBACK_AGENT` and `CIRCLEBACK_SESSION`), those are saved too, so the episode can be joined to the agent's own transcript.
- The compare bar gets 👍 / 👎. Rating also saves a snapshot of the live page as you judged it.

`circleback export` joins everything into one JSON line per note: `request` (the note), `reply`, `diff`, `trees` (before/after git trees), `snapshots` (before/after HTML) and `outcome`:

| outcome | meaning |
|---|---|
| `good` / `bad` | you rated it in compare |
| `recircled` | you circled the same spot again after the reply (`recircledBy` points at that note) |
| `unrated` | answered, nothing else heard |
| `unanswered` | no reply yet |

Everything stays in `.circleback/`. Snapshots are full copies of your page, so check them before sharing a dataset.

## Keys

| Key | What it does |
|---|---|
| <kbd>`</kbd> | Circle something and leave a note |
| <kbd>Shift</kbd>+<kbd>`</kbd> | Freeze the page first, then circle on the frozen copy. Open menus and hover states stay put. |
| <kbd>\</kbd> | Compare: the page before your last note on this page against the live page. Split with a draggable divider, or Before / Now. Scrolling stays in sync. |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Paste an image (a fresh snip, a mockup, an asset). On the page it starts a note: circle where it goes. In the note box it adds another. Images can also be dropped onto the note. |
| <kbd>Esc</kbd> | Cancel or close |

Agent replies also show a **Compare** button.

## Notes

- The overlay is only in pages served through the proxy, never in your build.
- The proxy rewrites `Host` and `Origin` to the target, so dev servers that check origins (e.g. Next's `allowedDevOrigins`) keep working.
- HTML responses are buffered to inject one `<script>` tag. Everything else streams.
