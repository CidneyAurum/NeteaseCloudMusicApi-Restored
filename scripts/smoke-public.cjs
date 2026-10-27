'use strict'

// Explicit public-metadata check: never load a user's Cookie or download media.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const temporaryRoot = path.resolve(os.tmpdir())
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'ncm-public-smoke-'))
  for (const name of ['TMP', 'TEMP', 'TMPDIR']) process.env[name] = directory
  let server
  try {
    const app = await require('../app').start({ host: '127.0.0.1', port: 0 })
    server = app.server
    const base = `http://127.0.0.1:${server.address().port}`
    const result = []
    for (const [keywords, type] of [['Mili Hero', 1], ['雨爱司凤版', 2000]]) {
      const response = await fetch(base + '/search', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keywords, type, limit: 2 }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await response.json()
      if (!response.ok || data.code !== 200) throw new Error('Public search failed')
      const rows = type === 1 ? data.result?.songs : data.data?.resources
      if (!Array.isArray(rows) || !rows.length) throw new Error('Public search returned no metadata')
      result.push({ type, keywords, count: rows.length })
    }
    console.log(JSON.stringify({ publicSearch: result, cookieUsed: false, downloads: 0 }))
  } finally {
    if (server) await new Promise((resolve) => {
      server.close(resolve)
      server.closeAllConnections?.()
    })
    const resolved = path.resolve(directory)
    if (path.dirname(resolved) !== temporaryRoot
        || !path.basename(resolved).startsWith('ncm-public-smoke-')) {
      throw new Error('Unexpected temporary directory')
    }
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}

main().catch(() => {
  console.error('Public metadata smoke failed; availability depends on the upstream service.')
  process.exitCode = 1
})
