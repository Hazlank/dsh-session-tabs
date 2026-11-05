import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { Readable } from 'node:stream'

import { apply } from '../lib/index.js'

const STATE_PATH = '/api/dsh-session-tabs/state'
const PREFS_PATH = '/api/dsh-session-tabs/prefs'

function harness() {
  const routes = new Map()
  const effects = []
  const ctx = {
    effect(fn) {
      const dispose = fn()
      effects.push(dispose)
      return dispose
    },
    webServer: {
      register({ path: routePath, handler }) {
        routes.set(routePath, handler)
        return () => {
          if (routes.get(routePath) === handler) routes.delete(routePath)
        }
      },
    },
  }
  return {
    ctx,
    routes,
    dispose() {
      for (const effect of effects.reverse()) effect()
    },
  }
}

function request({ method = 'GET', remoteAddress = '127.0.0.1', body } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  req.method = method
  req.socket = { remoteAddress }
  return req
}

function response() {
  let resolve
  const done = new Promise((next) => {
    resolve = next
  })
  const res = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.status = status
      this.headers = headers
    },
    end(chunk = '') {
      this.body += chunk
      resolve()
    },
  }
  return { res, done }
}

async function call(handler, options) {
  const { res, done } = response()
  await handler(request(options), res)
  await done
  return {
    status: res.status,
    headers: res.headers,
    body: res.body === '' ? null : JSON.parse(res.body),
  }
}

async function withHome(fn) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-tabs-test-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    await fn(home)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
}

test('GET state starts empty and exposes only JSON', async () => {
  await withHome(async () => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)
    const result = await call(routes.get(STATE_PATH))
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.equal(result.body.state, null)
    assert.match(result.headers['content-type'], /^application\/json/)
    dispose()
  })
})

test('state round-trips through the host file and deduplicates ids', async () => {
  await withHome(async (home) => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)
    const result = await call(routes.get(STATE_PATH), {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { id: 'a', label: 'Alpha', workspace: 'One' },
          { id: 'a', label: 'Duplicate', workspace: 'One' },
          { id: 'b', label: 'Beta', workspace: 'Two' },
        ],
        lastActiveId: 'b',
      }),
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.ok, true)
    assert.deepEqual(result.body.state.items.map((item) => item.id), ['a', 'b'])
    assert.equal(result.body.state.lastActiveId, 'b')

    const stored = JSON.parse(await readFile(path.join(home, 'session-tabs.json'), 'utf8'))
    assert.equal(stored.items.length, 2)
    assert.equal(stored.version, 1)

    const loaded = await call(routes.get(STATE_PATH))
    assert.equal(loaded.body.state.items.length, 2)
    dispose()
  })
})

test('state is capped at 50 items', async () => {
  await withHome(async () => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)
    const items = Array.from({ length: 55 }, (_, index) => ({
      id: `session-${index}`,
      label: `Session ${index}`,
      workspace: 'Workspace',
    }))
    const result = await call(routes.get(STATE_PATH), {
      method: 'POST',
      body: JSON.stringify({ items }),
    })
    assert.equal(result.body.state.items.length, 50)
    dispose()
  })
})

test('state rejects non-loopback traffic and bad requests', async () => {
  await withHome(async () => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)

    const forbidden = await call(routes.get(STATE_PATH), { remoteAddress: '10.0.0.2' })
    assert.equal(forbidden.status, 403)

    const method = await call(routes.get(STATE_PATH), { method: 'DELETE' })
    assert.equal(method.status, 405)

    const invalid = await call(routes.get(STATE_PATH), {
      method: 'POST',
      body: 'not json',
    })
    assert.equal(invalid.status, 400)
    dispose()
  })
})

test('prefs clamp duration, volume, and invalid tone', async () => {
  await withHome(async () => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)

    const initial = await call(routes.get(PREFS_PATH))
    assert.equal(initial.body.prefs.durationMs, 3000)
    assert.equal(initial.body.prefs.volume, 80)

    const clampedLow = await call(routes.get(PREFS_PATH), {
      method: 'POST',
      body: JSON.stringify({ durationMs: 250, volume: 140, tone: 'bad', sound: 'yes' }),
    })
    assert.equal(clampedLow.body.prefs.durationMs, 1000)
    assert.equal(clampedLow.body.prefs.volume, 100)
    assert.equal(clampedLow.body.prefs.tone, 'chime')
    assert.equal(clampedLow.body.prefs.sound, false)

    const clampedHigh = await call(routes.get(PREFS_PATH), {
      method: 'POST',
      body: JSON.stringify({ durationMs: 40000, volume: -5, tone: 'drop' }),
    })
    assert.equal(clampedHigh.body.prefs.durationMs, 30000)
    assert.equal(clampedHigh.body.prefs.volume, 0)
    assert.equal(clampedHigh.body.prefs.tone, 'drop')
    dispose()
  })
})

test('dispose removes both routes', async () => {
  await withHome(async () => {
    const { ctx, routes, dispose } = harness()
    apply(ctx)
    assert.equal(routes.size, 2)
    dispose()
    assert.equal(routes.size, 0)
  })
})
