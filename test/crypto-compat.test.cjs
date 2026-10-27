'use strict'

const assert = require('node:assert/strict')
const { createDecipheriv } = require('node:crypto')
const { test } = require('node:test')
const protocol = require('../util/crypto.js')
const fixtures = require('./fixtures/weapi-upstream-4.32.0.json')

// Captured once, offline, from the original npm 4.32.0 weapi implementation
// using node-forge's raw RSA "NONE" operation, before replacing it. These are
// public protocol vectors, not credentials, account cookies or private keys.
// Do not regenerate expectations with the implementation being tested.
for (const sample of fixtures.samples) {
  test(`weapi preserves upstream bytes with Math.random fixed at ${sample.random}`, () => {
    const previous = Math.random
    let actual
    try {
      Math.random = () => sample.random
      actual = protocol.weapi(fixtures.payload)
    } finally {
      Math.random = previous
    }
    assert.deepEqual(actual, { params: sample.params, encSecKey: sample.encSecKey })
    assert.match(actual.encSecKey, /^[0-9a-f]{256}$/)
    assert.equal(Math.random, previous)
  })
}

test('eapi retains a public request URL and Unicode payload through its decoder', () => {
  const url = '/api/search/voice/get'
  const data = Object.freeze({ keyword: '\u4e16\u754c\u4e0a\u6700\u5c0f\u7684\u5927\u679c', limit: 3 })
  const encrypted = protocol.eapi(url, data)
  assert.match(encrypted.params, /^(?:[0-9A-F]{32})+$/)
  assert.deepEqual(protocol.eapiReqDecrypt(encrypted.params), { url, data })
})

test('linuxapi ciphertext is readable with the independent standard Node AES decoder', () => {
  const data = Object.freeze({ method: 'POST', url: '/api/search/get', params: { s: 'offline fixture' } })
  const encrypted = protocol.linuxapi(data)
  const decoder = createDecipheriv('aes-128-ecb', Buffer.from('rFgB&h#%2?^eDg:Q'), null)
  const plaintext = Buffer.concat([
    decoder.update(Buffer.from(encrypted.eparams, 'hex')), decoder.final(),
  ]).toString('utf8')
  assert.deepEqual(JSON.parse(plaintext), data)
})
