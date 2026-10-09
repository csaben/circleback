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
| `circleback [--target URL] [--port 3999] [--host 127.0.0.1]` | Proxy with the overlay injected |
| `circleback watch` | Print each new note as one JSON line (for agent monitors) |
| `circleback reply <id> <message>` | Show a reply toast on the page for that note |

All commands take `--dir` (default `.circleback`). That folder holds `inbox.jsonl` and `replies.jsonl` and ignores itself in git.

## What a note contains

The note text, the page URL and title, viewport, scroll position, theme, the circled box (viewport and page coordinates), the element at the centre of the circle, and up to eight outermost elements inside it, each with tag, id, classes, a short CSS path, text and a few useful attributes.

Every note also saves a **snapshot**: a script-free copy of the page as it looked when you started drawing, with styles copied in and hover/focus states pinned. The note's `snapshotFile` points at it in `.circleback/snapshots/`.

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
