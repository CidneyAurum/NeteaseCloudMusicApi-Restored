'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const baseline = require('../provenance/upstream-sha256.json')
const release = require('../provenance/npm-release.json')
const moved = {
  'README.MD': 'provenance/UPSTREAM_README.md',
  'package.json': 'provenance/upstream-package.json',
}
const modified = []
let unchanged = 0
assert.equal(Object.keys(baseline).length, release.file_count)
for (const [name, expected] of Object.entries(baseline)) {
  const relative = moved[name] || name
  const target = path.resolve(root, relative)
  assert.ok(target.startsWith(root + path.sep), 'source path escaped repository')
  assert.ok(fs.statSync(target).isFile(), `missing original source: ${name}`)
  const actual = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  if (actual === expected) unchanged += 1
  else modified.push(name)
  if (name === 'LICENSE' || moved[name]) assert.equal(actual, expected, `changed attribution: ${name}`)
}
console.log(JSON.stringify({
  npmVersion: release.version, originalFiles: release.file_count,
  unchangedFiles: unchanged, modifiedFiles: modified,
  licensePreserved: true, originalMetadataPreserved: true,
}, null, 2))
