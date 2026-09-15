'use strict'

const { test, skip } = require('tap')
const { setCookie, Headers } = require('../..')
const { nodeMajor } = require('../../lib/core/util')

if (nodeMajor < 16) {
  skip('cookies are not supported in node < v16')
  process.exit()
}

function set (domain) {
  setCookie(new Headers(), { name: 'Space', value: 'Cat', domain })
}

const invalidDomain = { message: 'Invalid cookie domain' }

test('cookie domain validation - does not throw for the root domain " "', (t) => {
  t.doesNotThrow(() => set(' '))

  t.end()
})

test('cookie domain validation - does not throw for a valid domain', (t) => {
  t.doesNotThrow(() => set('example.com'))
  t.doesNotThrow(() => set('sub.example.com'))
  t.doesNotThrow(() => set('deno.land'))
  t.doesNotThrow(() => set('ex-ample.com'))
  t.doesNotThrow(() => set('1example.com'))
  t.doesNotThrow(() => set('a'.repeat(63)))
  t.doesNotThrow(() => set('a'.repeat(63) + '.com'))

  t.end()
})

test('cookie domain validation - throws when the name is longer than 255 octets', (t) => {
  t.throws(() => set('a'.repeat(256)), invalidDomain)

  t.end()
})

test('cookie domain validation - throws for an empty label', (t) => {
  t.throws(() => set('.example.com'), invalidDomain)
  t.throws(() => set('example..com'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws when a label ends with a hyphen before a separator', (t) => {
  t.throws(() => set('example-.com'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws when a label starts with a non-letter/digit', (t) => {
  t.throws(() => set('-example.com'), invalidDomain)
  t.throws(() => set('example.-com'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws for an interior character that is not a letter, digit, or hyphen', (t) => {
  t.throws(() => set('exa_mple.com'), invalidDomain)
  t.throws(() => set('example.c*m'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws when a label is longer than 63 octets', (t) => {
  t.throws(() => set('a'.repeat(64)), invalidDomain)
  t.throws(() => set('a'.repeat(64) + '.com'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws for a trailing dot', (t) => {
  t.throws(() => set('example.com.'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws for a trailing hyphen', (t) => {
  t.throws(() => set('example-'), invalidDomain)
  t.throws(() => set('example.com-'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws when the domain injects an attribute via ";"', (t) => {
  t.throws(() => set('example.com; SameSite=None'), invalidDomain)
  t.throws(() => set('example.com;HttpOnly'), invalidDomain)

  t.end()
})

test('cookie domain validation - throws for non-ascii and CTL characters', (t) => {
  t.throws(() => set('exampl\xE9.com'), invalidDomain)
  t.throws(() => set('example.com\r\nSet-Cookie: evil=1'), invalidDomain)

  t.end()
})
