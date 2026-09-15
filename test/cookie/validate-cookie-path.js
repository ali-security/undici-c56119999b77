'use strict'

const { test } = require('tap')
const { validateCookiePath } = require('../../lib/cookies/util')

// `lib/cookies/util` has no dependencies of its own, so - unlike the tests that
// go through the public cookie exports - this file runs on every supported node
// version and needs no `nodeMajor` guard.

test('validateCookiePath - should throw for a CTL character', (t) => {
  t.throws(() => validateCookiePath('/\x00'))
  t.throws(() => validateCookiePath('/\t'))
  t.throws(() => validateCookiePath('/\n'))
  t.throws(() => validateCookiePath('/\r'))
  t.throws(() => validateCookiePath('/\x1F'))
  t.throws(() => validateCookiePath('/\x7F'))

  t.end()
})

test('validateCookiePath - should throw for a space', (t) => {
  t.throws(() => validateCookiePath('/a b'))
  t.throws(() => validateCookiePath(' '))

  t.end()
})

test('validateCookiePath - should throw for a semicolon', (t) => {
  t.throws(() => validateCookiePath('/;'))
  t.throws(() => validateCookiePath(';'))
  t.throws(() => validateCookiePath('/;Domain=example.com'))

  t.end()
})

test('validateCookiePath - should throw for non-ascii characters', (t) => {
  t.throws(() => validateCookiePath('/a\xE9')) // é, 0xE9
  t.throws(() => validateCookiePath('/\x80')) // first C1 control
  t.throws(() => validateCookiePath('/\x9F')) // last C1 control
  t.throws(() => validateCookiePath('/\xFF')) // 0xFF
  t.throws(() => validateCookiePath('\u{1F600}'))

  t.end()
})

test('validateCookiePath - should pass for a printable character', (t) => {
  t.equal(validateCookiePath('A'), undefined)
  t.equal(validateCookiePath('Z'), undefined)
  t.equal(validateCookiePath('!'), undefined)
  t.equal(validateCookiePath('~'), undefined) // 0x7E, the last allowed octet
  t.equal(validateCookiePath('/'), undefined)
  t.equal(validateCookiePath('/foo/bar'), undefined)

  t.end()
})

test('validateCookiePath - should pass for an empty path', (t) => {
  t.equal(validateCookiePath(''), undefined)

  t.end()
})
