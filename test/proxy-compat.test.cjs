'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createRequire } = require('node:module')
const net = require('node:net')
const { test } = require('node:test')
const { getUri } = require('get-uri')
const { PacProxyAgent } = require('pac-proxy-agent')

// Resolve exactly the implementation get-uri loads, including a nested override.
const requireFromGetUri = createRequire(require.resolve('get-uri'))
const { Client } = requireFromGetUri('basic-ftp')
const ftpPackage = requireFromGetUri('basic-ftp/package.json')
const PAC_SCRIPT = 'function FindProxyForURL(url, host) { return "DIRECT"; }\n'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  assert.equal(server.address().address, '127.0.0.1')
  return server.address().port
}

async function closeServer(server) {
  if (!server.listening) return
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

async function fakeFtp(t, { epsv = true, mdtm = true, advertisedHost = '127,0,0,1' } = {}) {
  const commands = []
  const sockets = new Set()
  const servers = []
  const failures = []

  function track(socket) {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    // Clients legitimately close immediately after a completed transfer or a
    // rejected PASV target. Suppress teardown socket errors, not command failures.
    socket.on('error', () => {})
    return socket
  }

  const control = net.createServer((socket) => {
    track(socket)
    let incoming = ''
    let chain = Promise.resolve()
    let dataSocket

    async function passive(extended) {
      const dataServer = net.createServer()
      servers.push(dataServer)
      dataSocket = once(dataServer, 'connection').then(([connection]) => {
        track(connection)
        dataServer.close()
        return connection
      })
      const port = await listen(dataServer)
      socket.write(extended
        ? `229 Entering Extended Passive Mode (|||${port}|)\r\n`
        : `227 Entering Passive Mode (${advertisedHost},${Math.floor(port / 256)},${port % 256})\r\n`)
    }

    async function transfer(payload) {
      assert.ok(dataSocket, 'a passive data socket must precede any transfer')
      socket.write('150 Opening binary data connection\r\n')
      const connection = await dataSocket
      dataSocket = undefined
      connection.end(payload, () => socket.write('226 Transfer complete\r\n'))
    }

    async function dispatch(line) {
      commands.push(line)
      const separator = line.indexOf(' ')
      const verb = separator < 0 ? line : line.slice(0, separator)
      const argument = separator < 0 ? '' : line.slice(separator + 1)
      switch (verb) {
        case 'USER':
          socket.write('331 Password required\r\n')
          break
        case 'PASS':
          socket.write('230 Logged in\r\n')
          break
        case 'FEAT':
          socket.write(mdtm
            ? '211 No additional features\r\n'
            : '211-Features\r\n MLST type;size;modify;\r\n211 End\r\n')
          break
        case 'OPTS':
        case 'TYPE':
        case 'STRU':
          socket.write('200 Command accepted\r\n')
          break
        case 'MDTM':
          assert.equal(argument, '/proxy.pac')
          socket.write(mdtm ? '213 20260102030405\r\n' : '502 MDTM not implemented\r\n')
          break
        case 'EPSV':
          if (epsv) await passive(true)
          else socket.write('502 EPSV not implemented\r\n')
          break
        case 'PASV':
          await passive(false)
          break
        case 'LIST':
          await transfer(`-rw-r--r-- 1 owner group ${Buffer.byteLength(PAC_SCRIPT)} Jan 02 2026 proxy.pac\r\n`)
          break
        case 'MLSD':
          await transfer(`type=file;size=${Buffer.byteLength(PAC_SCRIPT)};modify=20260102030405; proxy.pac\r\n`)
          break
        case 'RETR':
          assert.equal(argument, '/proxy.pac')
          await transfer(PAC_SCRIPT)
          break
        case 'QUIT':
          socket.end('221 Bye\r\n')
          break
        default:
          throw new Error(`Unsupported fake FTP command: ${verb}`)
      }
    }

    socket.on('data', (chunk) => {
      incoming += chunk.toString('utf8')
      while (incoming.includes('\r\n')) {
        const end = incoming.indexOf('\r\n')
        const line = incoming.slice(0, end)
        incoming = incoming.slice(end + 2)
        chain = chain.then(() => dispatch(line)).catch((error) => {
          failures.push(error)
          socket.destroy()
        })
      }
    })
    socket.write('220 Offline loopback FTP test fixture\r\n')
  })
  servers.push(control)
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    await Promise.all(servers.map(closeServer))
    assert.deepEqual(failures, [])
  })
  const port = await listen(control)
  return { url: `ftp://127.0.0.1:${port}/proxy.pac`, port, commands }
}

async function readText(stream) {
  const parts = []
  for await (const part of stream) parts.push(Buffer.from(part))
  return Buffer.concat(parts).toString('utf8')
}

test('scoped basic-ftp override preserves get-uri FTP download and MDTM caching', { timeout: 10000 }, async (t) => {
  assert.equal(ftpPackage.version, '6.2.1')
  const fixture = await fakeFtp(t)
  const stream = await getUri(fixture.url)
  assert.equal(await readText(stream), PAC_SCRIPT)
  assert.ok(stream.lastModified instanceof Date)
  assert.equal(stream.lastModified.toISOString(), '2026-01-02T03:04:05.000Z')
  assert.ok(fixture.commands.includes('MDTM /proxy.pac'))
  assert.ok(fixture.commands.includes('EPSV'))
  assert.equal(fixture.commands.filter((line) => line === 'RETR /proxy.pac').length, 1)
  await assert.rejects(getUri(fixture.url, { cache: stream }), { code: 'ENOTMODIFIED' })
  assert.equal(fixture.commands.filter((line) => line === 'RETR /proxy.pac').length, 1)
})

test('get-uri retains directory modifiedAt fallback and same-host IPv4 PASV download', { timeout: 10000 }, async (t) => {
  const fixture = await fakeFtp(t, { epsv: false, mdtm: false })
  const stream = await getUri(fixture.url)
  assert.equal(await readText(stream), PAC_SCRIPT)
  assert.ok(stream.lastModified instanceof Date)
  assert.ok(Number.isFinite(stream.lastModified.getTime()))
  assert.ok(fixture.commands.some((line) => line.startsWith('MLSD ')))
  assert.ok(fixture.commands.includes('PASV'))
  assert.ok(fixture.commands.includes('RETR /proxy.pac'))
})

test('pac-proxy-agent loads a PAC script through its actual get-uri FTP chain', { timeout: 10000 }, async (t) => {
  const fixture = await fakeFtp(t)
  const agent = new PacProxyAgent('pac+' + fixture.url)
  t.after(() => agent.destroy())
  assert.equal(await agent.loadPacFile(), PAC_SCRIPT)
  assert.ok(fixture.commands.includes('RETR /proxy.pac'))
})

test('FTP security default rejects a separate PASV host before any data connection', { timeout: 10000 }, async (t) => {
  // 192.0.2.10 is only a string in the PASV reply. The _newSocket guard proves
  // that the client rejects it before creating or connecting a data socket.
  const fixture = await fakeFtp(t, { epsv: false, advertisedHost: '192,0,2,10' })
  const client = new Client(3000)
  t.after(() => client.close())
  await client.access({ host: '127.0.0.1', port: fixture.port })
  const originalNewSocket = client.ftp._newSocket
  let dataSocketAttempts = 0
  client.ftp._newSocket = () => {
    dataSocketAttempts += 1
    throw new Error('separate-host PASV must never create a data socket')
  }
  try {
    await assert.rejects(client.prepareTransfer(client.ftp), /PASV returned another host/)
    assert.equal(dataSocketAttempts, 0)
    assert.ok(fixture.commands.includes('PASV'))
    assert.equal(fixture.commands.some((line) => line.startsWith('RETR ')), false)
  } finally {
    client.ftp._newSocket = originalNewSocket
  }
})
