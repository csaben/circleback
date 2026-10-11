---
name: circleback
description: Live visual feedback loop for web projects. The user circles part of their running site in the browser and types a note; you receive it, fix the code, hot reload shows the change, and you reply on the page. Use when the user wants to give UI feedback by pointing at the page, asks for "circleback", or wants fast small fixes with hot reload.
---

# circleback

The user circles something on their running site and types what should change. Each note reaches you as one JSON line. You fix it, the dev server hot reloads, and your short reply pops up on their page.

## 1. Start it

Find the project's dev server URL (start it if it isn't running; check package.json scripts, framework defaults: Next 3000, Vite 5173, Astro 4321). Then run the proxy **in the background** from the project root:

```bash
npx -y github:csaben/circleback --target http://localhost:3000 --port 3999
```

- It injects the overlay into every HTML page and passes everything else through, including hot reload WebSockets. The project's code is not modified.
- Notes go to `.circleback/inbox.jsonl` in the current directory. That folder ignores itself in git.
- If the user asks to collect traces or build a dataset, add `--trace`. `npx -y github:csaben/circleback export --out episodes.jsonl` writes it out.
- To reach it from another device (phone, tailnet), add `--host 0.0.0.0` or put it behind `tailscale serve`. Only do that if the user asks.

Tell the user: open `http://localhost:3999`, press **`** (backtick) or the pink ✎ button, circle the thing, type the change, press Enter. **Shift+`** freezes the page first (keeps open menus and hover states while they circle). After a fix, **\** (or the ⇆ button, or "Compare" on your reply) shows the page before their note against the live page, with a draggable divider.

## 2. Watch for notes

Arm a monitor on the inbox. With Claude Code's Monitor tool:

```bash
npx -y github:csaben/circleback watch
```

Each stdout line is one note. Use the maximum timeout and re-arm it when it expires, for as long as the user is giving feedback. Without a Monitor tool, read new lines of `.circleback/inbox.jsonl` when the user says they've sent notes.

## 3. Handle each note

A note looks like:

```json
{"id":"mv16uw1v","note":"seems kinda cramped?","url":"/","viewport":{"width":1920,"height":991},
 "scroll":{"x":0,"y":0},"theme":"light","box":{...},"pageBox":{...},
 "pointed":{"tag":"section","classes":["home-hero"],"path":"main > div.minimal-home > section.home-hero","text":"..."},
 "elements":[{"tag":"p","classes":["home-sub"],"path":"...","text":"..."}]}
```

- `note` is what they want, in their words. `pointed` is the element at the centre of the circle; `elements` are the outermost elements mostly inside it. `url`, `viewport`, `scroll` and `theme` say exactly what they were looking at.
- `snapshotFile` is a script-free HTML copy of the page exactly as they saw it, with styles inlined. Elements that were hovered or focused carry `data-cb-hover`, `data-cb-focus` etc., and `state` on an element lists them. `frozen: true` means they froze the page first, usually to point at something that only shows on hover or while a menu is open. Read the snapshot (grep it) when the note is about such a state, or when the live page may already differ.
- Find the code with the class names, ids and text: grep for them. Prefer the component and stylesheet that own that element.
- Make the smallest change that does what they asked. Match the project's existing style. Scope page-specific changes so they don't leak into other pages.
- If the note is vague ("looks off", "make it nicer"), make a confident, tasteful attempt rather than asking. They can circle it again.
- If you can take screenshots (Playwright, a browser tool), check your change at the note's `viewport`, `scroll` and `theme` before replying. If the screenshot shows a problem, fix it first.
- Run the project's fast checks (typecheck, lint) when you touched logic.

## 4. Reply on the page

```bash
npx -y github:csaben/circleback reply <id> "Gave the hero more room; subtitle is a touch larger."
```

One short sentence about what changed. It shows as a toast on the user's page, even after a reload. If you know your model name or session id, add `--agent <model> --session <id>` so traced runs can be matched to your transcript. Reply only once the fix is complete: when the user has turned on tracing, the code diff is recorded at reply time. Also tell the user in chat. Then handle the next note. Notes arrive in order; work through them one at a time.

## Notes

- Hot reload shows most changes without a refresh. Some changes (layout files, server config) need a few seconds or a reload.
- Never commit, push or deploy because of a note. The loop is for local edits.
- Stop the proxy and monitor when the user is done.
