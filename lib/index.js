/**
 * Host half of dsh-session-tabs.
 *
 * The tab strip itself lives in the browser (`lib/client.js`); this half only
 * owns one small JSON file so the tab set survives an application restart.
 * Browser `localStorage` is not enough: the desktop app serves the GUI from an
 * ephemeral loopback port, so the page origin (and with it localStorage)
 * changes on every launch.
 *
 * Routes (same-origin, loopback only):
 *   GET  /api/dsh-session-tabs/state  -> { ok, state: TabState | null }
 *   POST /api/dsh-session-tabs/state  <- { items, lastActiveId, updatedAt }
 *                                     -> { ok, state }
 *   GET  /api/dsh-session-tabs/prefs  -> { ok, prefs }
 *   POST /api/dsh-session-tabs/prefs  <- { enabled?, durationMs?, sound?, tone? }
 *                                     -> { ok, prefs }
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/** Cordis plugin name; must match the package name for the client graph. */
export const name = 'dsh-session-tabs'

/** Only the webserver is required; every other surface is optional. */
export const inject = ['webServer']

const API = '/api/dsh-session-tabs/state'
const PREFS_API = '/api/dsh-session-tabs/prefs'
const MAX_ITEMS = 50
const MAX_BODY = 64 * 1024
const MAX_PREFS_BODY = 8 * 1024
const DEFAULT_PREFS = { enabled: true, durationMs: 3000, sound: false, tone: 'chime' }
const TONES = new Set(['chime', 'soft', 'marimba', 'drop'])
const MIN_DURATION = 1000
const MAX_DURATION = 30000

/** Resolve `~/.dsh/session-tabs.json` (honours DSH_HOME). */
function storePath() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, 'session-tabs.json')
}

/** Resolve `~/.dsh/session-tabs-prefs.json` (toast settings). */
function prefsPath() {
  const home = process.env.DSH_HOME || path.join(homedir(), '.dsh')
  return path.join(home, 'session-tabs-prefs.json')
}

/** Normalize whatever the browser sent into the tiny persisted shape. */
function sanitize(input) {
  const source = input && typeof input === 'object' ? input : {}
  const seen = new Set()
  const items = []
  if (Array.isArray(source.items)) {
    for (const entry of source.items) {
      if (items.length >= MAX_ITEMS) break
      if (!entry || typeof entry !== 'object') continue
      const id = typeof entry.id === 'string' ? entry.id.trim() : ''
      if (id === '' || seen.has(id)) continue
      seen.add(id)
      items.push({
        id,
        label: typeof entry.label === 'string' ? entry.label.slice(0, 200) : '',
        workspace: typeof entry.workspace === 'string' ? entry.workspace.slice(0, 160) : '',
      })
    }
  }
  const lastActiveId =
    typeof source.lastActiveId === 'string' && seen.has(source.lastActiveId) ? source.lastActiveId : null
  return { version: 1, items, lastActiveId, updatedAt: Date.now() }
}

/** Normalize toast preferences, clamping the duration into a usable range. */
function sanitizePrefs(input, base = DEFAULT_PREFS) {
  const source = input && typeof input === 'object' ? input : {}
  const enabled = typeof source.enabled === 'boolean' ? source.enabled : base.enabled
  const sound = typeof source.sound === 'boolean' ? source.sound : base.sound
  const tone = TONES.has(source.tone) ? source.tone : base.tone
  const parsed = Number(source.durationMs)
  const durationMs = Number.isFinite(parsed)
    ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(parsed)))
    : base.durationMs
  return { version: 1, enabled, durationMs, sound, tone, updatedAt: Date.now() }
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) return undefined
    chunks.push(chunk)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Loopback trust fence: the store is only ever served to this machine. */
function isLoopback(req) {
  const remote = req.socket.remoteAddress
  if (remote === undefined) return false
  const address = remote.startsWith('::ffff:') ? remote.slice(7) : remote
  return address === '127.0.0.1' || address === '::1'
}

/**
 * Cheap equality used to keep the newest timestamp for identical content.
 * @param {object} a - first state.
 * @param {object} b - second state.
 * @returns {boolean} true when both carry the same tab set.
 */
function sameItems(a, b) {
  if (a.items.length !== b.items.length) return false
  for (let i = 0; i < a.items.length; i += 1) {
    if (a.items[i].id !== b.items[i].id) return false
  }
  return a.lastActiveId === b.lastActiveId
}

export function apply(ctx) {
  const file = storePath()
  const prefsFile = prefsPath()
  let queue = Promise.resolve()
  let prefsQueue = Promise.resolve()

  async function load() {
    try {
      const raw = await readFile(file, 'utf8')
      const parsed = JSON.parse(raw)
      const state = sanitize(parsed)
      // Preserve the persisted timestamp instead of stamping "now" on read.
      state.updatedAt = Number(parsed.updatedAt) || 0
      return state
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      console.warn('[session-tabs] could not read tab state:', String(error))
      return null
    }
  }

  async function loadPrefs() {
    try {
      const raw = await readFile(prefsFile, 'utf8')
      const parsed = JSON.parse(raw)
      return sanitizePrefs(parsed)
    } catch (error) {
      if (error && error.code === 'ENOENT') return { version: 1, ...DEFAULT_PREFS }
      console.warn('[session-tabs] could not read toast preferences:', String(error))
      return { version: 1, ...DEFAULT_PREFS }
    }
  }

  function savePrefs(prefs) {
    const run = async () => {
      const payload = JSON.stringify(prefs, null, 2)
      await mkdir(path.dirname(prefsFile), { recursive: true })
      const temporary = `${prefsFile}.${process.pid}.tmp`
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, prefsFile)
      return prefs
    }
    prefsQueue = prefsQueue.then(run, run)
    return prefsQueue
  }

  function save(state) {
    // Serialize writers and replace atomically: a torn file would silently
    // drop the user's tab set on the next launch.
    const run = async () => {
      const payload = JSON.stringify(state, null, 2)
      await mkdir(path.dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      await writeFile(temporary, payload, 'utf8')
      await rename(temporary, file)
      return state
    }
    queue = queue.then(run, run)
    return queue
  }

  ctx.effect(
    () => {
      // One route for both verbs: the webserver matches by path, so two
      // same-path registrations would shadow each other by method.
      const disposeState = ctx.webServer.register({
        kind: 'exact',
        path: API,
        handler: async (req, res) => {
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
          if (req.method === 'GET') {
            const state = await load()
            return writeJson(res, 200, { ok: true, state })
          }
          if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method not allowed' })
          const body = await readBody(req)
          if (body === undefined) return writeJson(res, 400, { ok: false, error: 'invalid body' })
          try {
            const current = await load()
            const next = sanitize(body)
            // If the client echoes exactly what is already stored, keep the
            // stored timestamp so a stale tab set cannot win on the next load.
            if (current !== null && current.updatedAt > next.updatedAt && sameItems(current, next)) {
              return writeJson(res, 200, { ok: true, state: current })
            }
            const saved = await save(next)
            writeJson(res, 200, { ok: true, state: saved })
          } catch (error) {
            console.warn('[session-tabs] could not save tab state:', String(error))
            writeJson(res, 500, { ok: false, error: 'write failed' })
          }
        },
      })

      const disposePrefs = ctx.webServer.register({
        kind: 'exact',
        path: PREFS_API,
        handler: async (req, res) => {
          if (!isLoopback(req)) return writeJson(res, 403, { ok: false, error: 'forbidden: loopback only' })
          if (req.method === 'GET') {
            const prefs = await loadPrefs()
            return writeJson(res, 200, { ok: true, prefs })
          }
          if (req.method !== 'POST') return writeJson(res, 405, { ok: false, error: 'method not allowed' })
          const body = await readBody(req)
          if (body === undefined) return writeJson(res, 400, { ok: false, error: 'invalid body' })
          try {
            const current = await loadPrefs()
            const next = sanitizePrefs(body, current)
            next.updatedAt = Date.now()
            const saved = await savePrefs(next)
            writeJson(res, 200, { ok: true, prefs: saved })
          } catch (error) {
            console.warn('[session-tabs] could not save toast preferences:', String(error))
            writeJson(res, 500, { ok: false, error: 'write failed' })
          }
        },
      })

      return () => {
        disposeState()
        disposePrefs()
      }
    },
    'session-tabs: state routes',
  )
}
