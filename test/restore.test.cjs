'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { after, test } = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')
const originalTemp = path.resolve(os.tmpdir())
const sandbox = fs.mkdtempSync(path.join(originalTemp, 'ncm-restore-test-'))
for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = sandbox
delete process.env.PORT
delete process.env.HOST

// The upstream request module uses an anonymous-token file. Keep every test's
// token isolated from the user's running service and never register an account.
const bootstrap = require('../app.js')

after(() => {
  assert.equal(path.dirname(path.resolve(sandbox)), originalTemp)
  assert.ok(path.basename(sandbox).startsWith('ncm-restore-test-'))
  fs.rmSync(sandbox, { recursive: true, force: true })
})

async function closeServer(server) {
  if (!server || !server.listening) return
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeAllConnections?.()
  })
}

async function serve(t, options = {}) {
  const app = await bootstrap.start({ port: 0, checkVersion: false, ...options })
  assert.ok(app.server instanceof http.Server)
  t.after(() => closeServer(app.server))
  if (!app.server.listening) await once(app.server, 'listening')
  const address = app.server.address()
  assert.equal(address.address, '127.0.0.1')
  assert.ok(address.port > 0)
  return { app, base: `http://127.0.0.1:${address.port}` }
}

async function json(base, route, options) {
  const response = await fetch(base + route, {
    signal: AbortSignal.timeout(5000),
    ...options,
  })
  return { status: response.status, body: await response.json() }
}

function echo(query) {
  return Promise.resolve({ status: 200, cookie: [], body: { code: 200, params: query } })
}

function fixtureDefinition(route, moduleName, calls) {
  const endpoint = require(`../module/${moduleName}.js`)
  return {
    route,
    module: (query) => endpoint(query, async (uri, data, options) => {
      const forwarded = { uri, data, crypto: options?.crypto || '' }
      calls.push(forwarded)
      return { status: 200, cookie: [], body: { code: 200, forwarded } }
    }),
  }
}

test('bootstrap import has no listening or online registration side effects', () => {
  const code = `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const https = require('node:https');
    const cp = require('node:child_process');
    const deny = () => { throw new Error('import must stay offline'); };
    http.request = deny; https.request = deny;
    http.Server.prototype.listen = deny;
    cp.exec = deny; cp.spawn = deny;
    const app = require('./app.js');
    assert.equal(typeof app.start, 'function');
    assert.equal(typeof app.ensureAnonymousToken, 'function');
  `
  const child = spawnSync(process.execPath, ['-e', code], {
    cwd: root, env: { ...process.env }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(child.status, 0, child.stderr || child.stdout)
})

test('start binds loopback by default and supports an ephemeral port', async (t) => {
  const { app } = await serve(t, { moduleDefs: [] })
  assert.equal(app.server.address().address, '127.0.0.1')
  assert.equal(fs.readFileSync(path.join(sandbox, 'anonymous_token'), 'utf8'), '')
})

test('explicit port and host options override environment values, including port zero', async (t) => {
  const oldPort = process.env.PORT
  const oldHost = process.env.HOST
  process.env.PORT = 'invalid-environment-port'
  process.env.HOST = '192.0.2.1'
  try {
    await serve(t, { port: 0, host: '127.0.0.1', moduleDefs: [] })
  } finally {
    if (oldPort === undefined) delete process.env.PORT
    else process.env.PORT = oldPort
    if (oldHost === undefined) delete process.env.HOST
    else process.env.HOST = oldHost
  }
})

test('a caller can choose a short-lived custom loopback port', async (t) => {
  const reservation = http.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await closeServer(reservation)
  const { app } = await serve(t, { port, moduleDefs: [] })
  assert.equal(app.server.address().port, port)
})

test('the real HTTP router merges GET, JSON POST and form POST parameters', async (t) => {
  const { base } = await serve(t, { moduleDefs: [{ route: '/fixture/echo', module: echo }] })
  const get = await json(base, '/fixture/echo?keyword=hello%20world&limit=3')
  assert.equal(get.status, 200)
  assert.equal(get.body.params.keyword, 'hello world')
  assert.equal(get.body.params.limit, '3')

  const post = await json(base, '/fixture/echo?source=query&request=json', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'body', id: 123, labels: ['one', 'two'] }),
  })
  assert.equal(post.status, 200)
  assert.equal(post.body.params.source, 'body')
  assert.equal(post.body.params.request, 'json')
  assert.equal(post.body.params.id, 123)
  assert.deepEqual(post.body.params.labels, ['one', 'two'])

  const form = await json(base, '/fixture/echo?request=form', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ keywords: 'World Smallest Violin', type: '2000' }),
  })
  assert.equal(form.status, 200)
  assert.equal(form.body.params.keywords, 'World Smallest Violin')
  assert.equal(form.body.params.type, '2000')
})

test('two POST bodies at one URL never reuse the first search response', async (t) => {
  const { base } = await serve(t, { moduleDefs: [{ route: '/fixture/post-cache', module: echo }] })
  for (const keywords of ['first distinct search', 'second distinct search']) {
    const result = await json(base, '/fixture/post-cache', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keywords }),
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.params.keywords, keywords)
  }
})

test('synthetic session cookies never share cached GET data across sessions', async (t) => {
  const { base } = await serve(t, { moduleDefs: [{ route: '/fixture/session-cache', module: echo }] })
  for (const value of ['fixture-alpha', 'fixture-beta']) {
    const result = await json(base, '/fixture/session-cache', {
      headers: { cookie: `restoration_fixture=${value}` },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.params.cookie.restoration_fixture, value)
  }
})

test('sound search type 2000 uses the voice upstream route and keeps pagination', async (t) => {
  const calls = []
  const { base } = await serve(t, {
    moduleDefs: [fixtureDefinition('/search', 'search', calls)],
  })
  const response = await json(base, '/search?keywords=voice%20fixture&type=2000&limit=5&offset=10')
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [{
    uri: '/api/search/voice/get',
    data: { keyword: 'voice fixture', scene: 'normal', limit: '5', offset: '10' },
    crypto: '',
  }])
  assert.deepEqual(response.body.forwarded, calls[0])
})

test('program detail and song URL v1 remain available through real module adapters', async (t) => {
  const calls = []
  const { base } = await serve(t, { moduleDefs: [
    fixtureDefinition('/dj/program/detail', 'dj_program_detail', calls),
    fixtureDefinition('/song/url/v1', 'song_url_v1', calls),
  ] })
  const program = await json(base, '/dj/program/detail?id=42')
  assert.equal(program.status, 200)
  assert.deepEqual(calls[0], {
    uri: '/api/dj/program/detail', data: { id: '42' }, crypto: 'weapi',
  })
  const audio = await json(base, '/song/url/v1', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 900, level: 'standard' }),
  })
  assert.equal(audio.status, 200)
  assert.deepEqual(calls[1], {
    uri: '/api/song/enhance/player/url/v1',
    data: { ids: '[900]', level: 'standard', encodeType: 'flac' }, crypto: '',
  })
})

test('all restored endpoint modules load and key sound/music routes are discoverable', async () => {
  bootstrap.ensureAnonymousToken()
  const server = require('../server.js')
  const modules = await server.getModulesDefinitions(path.join(root, 'module'))
  assert.ok(modules.length >= 200, 'restoration must contain the endpoint collection')
  assert.ok(modules.every((item) => typeof item.module === 'function'))
  const routes = new Set(modules.map((item) => item.route))
  for (const route of ['/search', '/cloudsearch', '/dj/program/detail', '/song/url', '/song/url/v1', '/inner/version']) {
    assert.ok(routes.has(route), `missing route: ${route}`)
  }
})

test('CommonJS SDK and ESM default import expose the restored public endpoints', async () => {
  const sdk = require('..')
  for (const name of ['search', 'cloudsearch', 'dj_program_detail', 'song_url', 'song_url_v1', 'inner_version']) {
    assert.equal(typeof sdk[name], 'function', name)
  }
  const imported = await import(pathToFileURL(path.join(root, 'main.js')).href)
  assert.equal(imported.default.search, sdk.search)
  const result = await sdk.inner_version()
  assert.equal(result.status, 200)
  assert.equal(result.body.data.version, require('../package.json').version)
})

test('health and inner version are local and do not require an upstream connection', async (t) => {
  const { base } = await serve(t, { moduleDefs: [{
    route: '/inner/version', module: require('../module/inner_version.js'),
  }] })
  const health = await json(base, '/healthz')
  assert.equal(health.status, 200)
  assert.equal(health.body.status, 'ok')
  const version = await json(base, '/inner/version')
  assert.equal(version.status, 200)
  assert.equal(version.body.data.version, require('../package.json').version)
})

test('upstream-shaped failures are returned as HTTP errors rather than false success', async (t) => {
  const { base } = await serve(t, { moduleDefs: [{
    route: '/fixture/error', module: async () => {
      throw { status: 429, cookie: [], body: { code: 429, msg: 'offline fixture limit' } }
    },
  }] })
  const result = await json(base, '/fixture/error')
  assert.equal(result.status, 429)
  assert.deepEqual(result.body, { code: 429, msg: 'offline fixture limit' })
})

test('untrusted origins cannot execute API handlers, including dotted path suffixes', async (t) => {
  let calls = 0
  const { base } = await serve(t, { moduleDefs: [{
    route: '/fixture/origin-guard', module: (query) => { calls += 1; return echo(query) },
  }] })
  for (const route of ['/fixture/origin-guard', '/fixture/origin-guard/bypass.png']) {
    for (const origin of ['https://untrusted.example', 'null']) {
      const response = await fetch(base + route, {
        headers: { origin }, signal: AbortSignal.timeout(5000),
      })
      assert.equal(response.status, 403, `origin ${origin} must be rejected for ${route}`)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    }
  }
  assert.equal(calls, 0, 'denied origins must never reach an endpoint')
})

test('same-origin UI and explicitly allowed origins receive exact credential CORS headers', async (t) => {
  const previous = process.env.CORS_ALLOWED_ORIGINS
  process.env.CORS_ALLOWED_ORIGINS = 'https://ui.fixture.test, https://other.fixture.test'
  let running
  try {
    running = await serve(t, { moduleDefs: [{ route: '/fixture/allowed-origin', module: echo }] })
  } finally {
    if (previous === undefined) delete process.env.CORS_ALLOWED_ORIGINS
    else process.env.CORS_ALLOWED_ORIGINS = previous
  }
  const { base } = running
  for (const origin of [base, 'https://ui.fixture.test', 'https://other.fixture.test']) {
    const response = await fetch(base + '/fixture/allowed-origin', {
      headers: { origin }, signal: AbortSignal.timeout(5000),
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), origin)
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
    assert.match(response.headers.get('vary'), /(?:^|,\s*)Origin(?:,|$)/i)
    await response.arrayBuffer()
  }
  const preflight = await fetch(base + '/fixture/allowed-origin', {
    method: 'OPTIONS', headers: { origin: 'https://ui.fixture.test' },
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://ui.fixture.test')
  const suffixAttack = await fetch(base + '/fixture/allowed-origin', {
    headers: { origin: 'https://ui.fixture.test.evil.invalid' },
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(suffixAttack.status, 403)
})

test('JSON bodies larger than one MiB are rejected before the module executes', async (t) => {
  let calls = 0
  const { base } = await serve(t, { moduleDefs: [{
    route: '/fixture/body-limit', module: (query) => { calls += 1; return echo(query) },
  }] })
  const response = await fetch(base + '/fixture/body-limit', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: 'x'.repeat(1024 * 1024) }),
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(response.status, 413)
  assert.equal(calls, 0)
  await response.arrayBuffer()
})

test('cloud upload rejects missing or nonbinary files before any upstream request', async (t) => {
  const calls = []
  const { base } = await serve(t, {
    moduleDefs: [fixtureDefinition('/cloud', 'cloud', calls)],
  })
  for (const body of [{}, { songFile: { name: 'fixture.mp3', data: 'not-a-buffer' } }]) {
    const result = await json(base, '/cloud', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 400)
  }
  assert.equal(calls.length, 0)
})
