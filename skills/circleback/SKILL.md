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
- Phone builds (📱 button) are optional; see section 5. Only add `--builder` when one is chosen.
- To reach it from another device (phone, tailnet), add `--host 0.0.0.0` or put it behind `tailscale serve`. Only do that if the user asks.

Tell the user: open `http://localhost:3999`, press **`** (backtick) or the pink ✎ button, circle the thing, type the change, press Enter. **Ctrl+V** pastes an image (e.g. a snip) into a note. **Shift+`** freezes the page first (keeps open menus and hover states while they circle). After a fix, **\** (or the ⇆ button, or "Compare" on your reply) shows the page before their note against the live page, with a draggable divider.

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
- `attachments` lists images the user pasted or dropped in, as file paths under `.circleback/assets/`. Look at them. They are either a reference ("make it look like this") or an asset to use ("use this as the hero image"); the note and where they circled tell you which. To use one, copy it into the project's own assets folder with a sensible name and reference it from there, never from `.circleback/`.
- Find the code with the class names, ids and text: grep for them. Prefer the component and stylesheet that own that element.
- Make the smallest change that does what they asked. Match the project's existing style. Scope page-specific changes so they don't leak into other pages.
- If the note is vague ("looks off", "make it nicer"), make a confident, tasteful attempt rather than asking. They can circle it again.
- If you can take screenshots (Playwright, a browser tool), check your change at the note's `viewport`, `scroll` and `theme` before replying. If the screenshot shows a problem, fix it first.
- Run the project's fast checks (typecheck, lint) when you touched logic.

### Notes with a `kind` (from the 📱 button)

- `"kind": "make-app"`: the user wants this site installable on their phone, and the builder found no app here. Wrap the existing site with Capacitor rather than rewriting it:
  1. Make sure the web build outputs static files (Vite/Astro: `dist`; Next: set `output: 'export'`, output is `out`; plain HTML: the folder holding `index.html`).
  2. `npm i @capacitor/core @capacitor/android && npm i -D @capacitor/cli`
  3. `npx cap init "<App Name>" <reverse.domain.appid> --web-dir <output dir>`. Don't run `cap add android`; the builder does that on its side.
  4. If the site calls a dev-only backend (`localhost` APIs, a dev proxy), point those calls at a URL the phone can reach and say so in your reply.
  Projects that are already Expo, React Native, Flutter or native Android need no conversion. Reply with what you did and ask them to tap 📱 again.
- `"kind": "make-native"`: the user picked a Native build and there is no Expo, React Native or Android project. Port the site to Expo (React Native) in this folder, keeping its look and behaviour; reuse logic and assets where you can. This is a bigger job than a note usually is: say what you're about to do in your reply before the long part if it will take a while, and reply again when it's ready to build.
- `"kind": "build-failed"`: fetch the build log with `curl -s <logUrl>` (it goes through the proxy, so it works even when the builder is another machine; the end usually has the error). Fix the project here and reply asking them to tap 📱 → Retry. The builder only builds an uploaded copy, so every fix belongs in this folder.

## 4. Reply on the page

```bash
npx -y github:csaben/circleback reply <id> "Gave the hero more room; subtitle is a touch larger."
```

One short sentence about what changed. It shows as a toast on the user's page, even after a reload. If you know your model name or session id, add `--agent <model> --session <id>` so traced runs can be matched to your transcript. Reply only once the fix is complete: when the user has turned on tracing, the code diff is recorded at reply time. Also tell the user in chat. Then handle the next note. Notes arrive in order; work through them one at a time.

## 5. Phone builds (optional)

With `--builder <URL>` (or `CIRCLEBACK_BUILDER` in the environment) the overlay gets a 📱 button. The user picks **Live** (a tiny app that opens this circleback page), **Bundled** (Capacitor, site inside) or **Native** (Expo/RN/Android). The proxy packs up this folder (git-tracked and untracked files minus ignored ones, plus root `.env*` files) and uploads it to that build server; the APK comes back through circleback and the page shows an install QR. The build happens on the builder's machine, so it works the same whether that is this machine or another one on the network.

Phone builds usually go with editing from the phone, so start the proxy with `--host 0.0.0.0` (or behind `tailscale serve`) and `--public-url <how the phone reaches it>`, e.g. `https://<this machine>.<tailnet>.ts.net:3999`. Live apps load that address, and every app's "Edit in circleback" shortcut opens it.

Pick the builder from what the user says:

- They name a machine ("build on <machine>"): use that machine's builder URL. On a tailnet, `tailscale status` lists machines; the URL usually looks like `https://<machine>.<tailnet>.ts.net:<port>`. Ask for the port if you can't find it.
- They say to build on this machine: use a builder on localhost (`http://127.0.0.1:<port>`). One must be running here.
- They say nothing and `CIRCLEBACK_BUILDER` is set: use it.
- Otherwise, if they want phone builds, ask once which machine should build.

Check a builder before starting the proxy: `curl -s <URL>/api/config` returns JSON. Changing builders means restarting the proxy with the new `--builder`.

## Notes

- Hot reload shows most changes without a refresh. Some changes (layout files, server config) need a few seconds or a reload.
- Never commit, push or deploy because of a note. The loop is for local edits.
- Stop the proxy and monitor when the user is done.
