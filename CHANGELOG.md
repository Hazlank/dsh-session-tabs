# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/).

## [0.12.0] - 2026-11-05

### Added

- npm-ready package metadata, repository links, keywords, and a scoped package
  name (`@hazlank/dsh-session-tabs`).
- Localized plugin-card metadata in `locale/en.json` and `locale/zh.json`.
- A dedicated plugin icon, MIT license file, and release changelog.
- Host route tests, package-shape tests, and a GitHub Actions CI workflow.
- Instructions for npm, the desktop Plugins page, GitHub source installs, and
  the DSH Plugin Hub.

### Changed

- Install instructions no longer depend on a local absolute path.
- README is now English-first with a complete Chinese companion.
- Declared host capabilities and the loopback-only remote-access label.

## [0.11.1] - 2026-11-05

### Changed

- The settings navigation Float mark no longer carries a status dot or a
  window-title line.

## [0.11.0] - 2026-11-05

### Added

- Per-session inbox, unread badge, completion and attention toasts, optional
  notification sound, and configurable toast settings.
- Restart-safe tab persistence through a loopback host store.

### Changed

- Continued tab-strip polish, including the continuous bottom border and the
  Chrome-style active-tab merge.
