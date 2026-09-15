'use strict'

const { once } = require('events')
const { createServer } = require('http')
const { test, skip } = require('tap')
const { nodeMajor, nodeMinor } = require('../../lib/core/util')
const { fetch, Headers } = require('../..')

// `npm run test:fetch` gates this directory behind `verifyVersion.js 16`, but the
// file can also be handed to `tap` directly, where `fetch` is not exported yet.
if (nodeMajor < 16 || (nodeMajor === 16 && nodeMinor < 8)) {
  skip('fetch is not supported in node < v16.8.0')
  process.exit()
}

test('Can receive set-cookie headers from a server using fetch - issue #1262', async (t) => {
  const server = createServer((req, res) => {
    res.setHeader('set-cookie', 'name=value; Domain=example.com')
    res.end()
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const response = await fetch(`http://127.0.0.1:${server.address().port}`, { keepalive: false })

  t.equal(response.headers.get('set-cookie'), 'name=value; Domain=example.com')

  const response2 = await fetch(`http://127.0.0.1:${server.address().port}`, {
    credentials: 'include',
    keepalive: false
  })

  t.equal(response2.headers.get('set-cookie'), 'name=value; Domain=example.com')

  t.end()
})

test('Can send cookies to a server with fetch - issue #1463', async (t) => {
  const server = createServer((req, res) => {
    t.equal(req.headers.cookie, 'value')
    res.end()
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const headersInit = [
    new Headers([['cookie', 'value']]),
    { cookie: 'value' },
    [['cookie', 'value']]
  ]

  for (const headers of headersInit) {
    await fetch(`http://127.0.0.1:${server.address().port}`, { headers, keepalive: false })
  }

  t.end()
})

test('Cookie header is delimited with a semicolon rather than a comma - issue #1905', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.equal(req.headers.cookie, 'FOO=lorem-ipsum-dolor-sit-amet; BAR=the-quick-brown-fox')
    res.end()
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  await fetch(`http://127.0.0.1:${server.address().port}`, {
    keepalive: false,
    headers: [
      ['cookie', 'FOO=lorem-ipsum-dolor-sit-amet'],
      ['cookie', 'BAR=the-quick-brown-fox']
    ]
  })
})
