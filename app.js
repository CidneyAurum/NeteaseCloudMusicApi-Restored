#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function ensureAnonymousToken(directory = os.tmpdir()) {
  const filename = path.join(directory, 'anonymous_token')
  try {
    fs.writeFileSync(filename, '', { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  const information = fs.lstatSync(filename)
  if (!information.isFile() || information.isSymbolicLink()) {
    throw new Error('Invalid anonymous token cache')
  }
  return filename
}

async function start(options = {}) {
  ensureAnonymousToken()
  // Startup stays offline; anonymous registration is an explicit SDK call.
  const { serveNcmApi } = require('./server')
  return serveNcmApi({ ...options, checkVersion: options.checkVersion ?? false })
}

module.exports = { start, ensureAnonymousToken }

if (require.main === module) {
  start().catch(() => {
    console.error('API startup failed. Check HOST, PORT and port ownership.')
    process.exitCode = 1
  })
}
