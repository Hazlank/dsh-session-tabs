# Session Tabs for DSH

English | [中文](README.zh.md)

[![npm version](https://img.shields.io/npm/v/%40hazlank%2Fdsh-session-tabs.svg)](https://www.npmjs.com/package/@hazlank/dsh-session-tabs)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/Hazlank/dsh-session-tabs/actions/workflows/ci.yml/badge.svg)](https://github.com/Hazlank/dsh-session-tabs/actions/workflows/ci.yml)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.5-blue)](https://github.com/deepseek-ai/deepseek-harness)

Chrome-style session tabs for the DeepSeek Harness (DSH) Web GUI. Click a
session in the left sidebar and it is pinned above the conversation area, with
its task title, workspace, and live state. Tabs survive reloads and application
restarts, and background sessions that finish or need you raise a toast and a
per-session inbox entry.

![Session tabs with running, waiting, and completed states](https://raw.githubusercontent.com/Hazlank/dsh-session-tabs/main/docs/images/tabs.png)

> Community plugin. Not affiliated with, endorsed by, or maintained by
> DeepSeek. Tabs are shortcuts: closing one never closes or archives the
> underlying session.

## Why

DSH's native main view binds one session at a time. The sidebar is good at
finding sessions, but not at keeping several of them in view while some run in
the background. Session Tabs adds a compact strip above the conversation area
and uses DSH's own session status to answer three questions at a glance:

- Which sessions are still running?
- Which one is waiting for an approval, an answer, or a plan review?
- Which ones finished while I was looking somewhere else?

It is deliberately **not** a split-pane workspace. Switching a tab is
equivalent to switching the main view's current session.

## Install

### Desktop app

Open **Settings → Plugins → Add plugin**, enter
`@hazlank/dsh-session-tabs`, and install it. Turn the plugin on, then reload the
window if the host half has not loaded yet.

### Web profile

```sh
dsh plugin --profile web add @hazlank/dsh-session-tabs
```

Use your profile name in place of `web` if needed. The package includes both
the host half and the browser half through its `cordis.patch.yml` bundle patch.

### From GitHub

```sh
dsh plugin --profile web add github:Hazlank/dsh-session-tabs
```

### From a local checkout

This is for development only:

```sh
dsh plugin --profile web add link:/absolute/path/to/dsh-session-tabs
```

## Features

### Tabs

- **Click to pin.** Opening a session from the sidebar, search, or a fork adds
  it to the strip. Direct navigation to a session also adds it.
- **Task and workspace.** Each tab reads `task title - workspace title`; the
  default workspace is shown as `Default Workspace` / `默认工作区`.
- **Chrome-style surface.** The strip uses the sidebar background; the active
  tab uses the conversation background and merges into the panel below. Short
  dividers hide around the active or hovered tab. The close button appears on
  hover.
- **Drag to reorder.** Drop between tabs to reorder them. The order is saved.
- **Overflow.** Tabs scroll horizontally; the mouse wheel also scrolls the
  strip.
- **Close safely.** The `×` button or middle-click closes a tab. Closing the
  active tab selects a neighbor. The DSH session is untouched.
- **Blank sessions wait.** A fresh blank session does not take a tab until it
  has a title or a first message.
- **Window dragging.** The blank area above and beside the tab row is a window
  drag region; tabs themselves are marked `no-drag`.

### Status

| State | Indicator | Meaning |
| --- | --- | --- |
| Running | Spinner | The session is working. Queued messages are treated as running. |
| Approval needed | Yellow dot | The session is waiting for an approval. |
| Answer needed | Yellow dot | The session is waiting for your answer. |
| Plan review | Yellow dot | A plan was submitted and is waiting for approval. |
| Done, unread | Green dot | The session finished while you were looking elsewhere. |
| Idle | None | No status badge. |

Hovering a yellow dot explains the specific waiting state. Opening the tab
acknowledges the completion state and clears the green dot.

### Notification inbox

- The bell at the start of the strip collects one current entry per session;
  the badge counts unread sessions and hides at zero.
- Waiting states take priority over completion:
  `approval > plan review > question > done`.
- Clicking an entry switches to that session and marks it read. **Mark all
  read** clears the list.
- Entries are stored in the browser's `localStorage`, so they survive a page
  reload.
- Closing a tab does not silently discard an unread entry; it follows the
  session state until handled or opened.
- The panel is 300 px tall and scrolls vertically only; long text is ellipsized.

![Notification inbox with approval, question, plan review, and done entries](https://raw.githubusercontent.com/Hazlank/dsh-session-tabs/main/docs/images/inbox.png)

### Toasts and sound

- A background session that completes or starts waiting raises a toast in the
  top-right corner. The toast names the task and workspace, and its button
  switches to the session.
- Waiting toasts distinguish approval, answer, and plan review. Approval toasts
  can offer **Allow once** when the current DSH approval API supports it.
- Queued messages do not raise a toast; they remain a running spinner.
- At most three toasts are visible; a new notification for the same session
  replaces the previous one.
- Notifications are on by default for 3000 ms and can be disabled or set to
  1000–30000 ms in **Settings → Session Tabs**.
- Optional notification sounds are synthesized with Web Audio (no audio files):
  chime, soft, marimba, or drop, with a 0–100 volume control and a preview
  button.

### Persistence and theme

- Tab order and the last active tab are saved both in browser storage and in
  `~/.dsh/session-tabs.json` through a loopback host route. The host file is the
  source of truth because the desktop app's local port (and therefore the page
  origin) changes between launches.
- Toast preferences are stored in `~/.dsh/session-tabs-prefs.json` and cached in
  browser storage.
- All colors use DSH theme tokens, so light, dark, and system themes follow the
  host automatically.

## Permissions and privacy

- The host half registers two same-origin routes under
  `/api/dsh-session-tabs/` and rejects requests that do not come from the
  loopback interface (`127.0.0.1` / `::1`).
- It writes only `~/.dsh/session-tabs.json` and
  `~/.dsh/session-tabs-prefs.json` (or the equivalent under `DSH_HOME`).
- The browser half stores the inbox and preference fallback in `localStorage`.
- There is no telemetry, analytics, advertising, or external service, and no
  data is uploaded anywhere.
- `dsh.capabilities` declares `fs:read`, `fs:write`, `network:ingress`, and
  `network:egress`. The `remote-access` label is present because the host
  exposes loopback HTTP routes; it does **not** mean the routes are reachable
  from another machine.

## Compatibility

- DSH Web GUI **0.2.1-rc.5**; the package declares
  `engines.dsh: >=0.2.1-rc.5 <0.2.2`.
- Node.js `^22.19.0 || >=24.0.0`.
- Desktop and web profiles are supported through their plugin managers.
- DSH client APIs still change between preview releases. Re-test after a DSH
  upgrade; a new host version is not claimed compatible until verified.

## Uninstall

Remove the package in **Settings → Plugins** (or with your profile's
`dsh plugin` command), then reload the window. The plugin removes its tab strip,
styles, listeners, and host routes.

Optional local data cleanup:

```sh
rm -f "$HOME/.dsh/session-tabs.json"
rm -f "$HOME/.dsh/session-tabs-prefs.json"
```

Clearing the site's browser storage also removes cached tabs and inbox entries.
Removing the plugin does not close, archive, or delete any DSH session.

## Known limitations

- Web GUI only (`dsh.client.platform: "web"`).
- No true side-by-side sessions; the main panel still binds one session at a
  time.
- Notifications are raised only for sessions that have a tab. A session that
  was never opened in the strip stays silent.
- Toast settings are shared by all GUI windows using the same host profile.
- A tab is a shortcut, not ownership: archived or released sessions may still
  produce a button that the host cannot open.
- UI copy is selected at page load; switching DSH's language may require a
  reload before the plugin's own labels change.
- The settings navigation icon is painted onto the matching row because DSH's
  `settings.section` API has no icon field. This is the most version-sensitive
  part of the plugin; re-check it after DSH UI updates.

## Development

There is no build step. `lib/client.js` and `lib/index.js` are loaded directly.

```sh
npm run check     # node --check on both halves
npm test          # node:test host and package checks
npm pack --dry-run --json
```

For interactive development, install the checkout with a `link:` spec and edit
`lib/` while DSH's HMR reloads the client half. Browser console messages are
prefixed with `[session-tabs]`.

The host store can be inspected from the GUI console:

```js
await (await fetch('/api/dsh-session-tabs/state')).json()
await (await fetch('/api/dsh-session-tabs/prefs')).json()
```

Screenshots live in `docs/images/`; they use synthetic session names.

## License

[MIT](LICENSE) © 2026 Hazlank
