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
| `circleback [--target URL] [--port 3999] [--host 127.0.0.1] [--builder URL]` | Proxy with the overlay injected |
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

📱 packs up the folder circleback runs in (what git sees, plus root `.env*` files) and uploads it to the builder, which builds an Android app. The panel shows progress, then a QR code to scan and install. The builder can be on this machine or any other one you can reach, so you can run circleback on a laptop and build on a beefier box. The QR points at the project's *latest* build, so the same code keeps working after every rebuild. If the project isn't an app yet, the panel offers **Make it an app**, which sends your agent a note to wrap the site with Capacitor. If a build fails, **Ask agent to fix** sends it a link to the build log.

A builder is any server with this small API: `POST /api/builds/upload?name=&host=&git=` (body: the project as .tar.gz), `GET /api/builds/:id`, `GET /api/builds/:id/log.txt`, `POST /api/builds/:id/cancel`, `GET /qr.svg?u=`. The page only talks to the proxy, which relays these calls, so the page never needs CORS.

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
| <kbd>Esc</kbd> | Cancel or close |

Agent replies also show a **Compare** button.

## Notes

- The overlay is only in pages served through the proxy, never in your build.
- The proxy rewrites `Host` and `Origin` to the target, so dev servers that check origins (e.g. Next's `allowedDevOrigins`) keep working.
- HTML responses are buffered to inject one `<script>` tag. Everything else streams.
