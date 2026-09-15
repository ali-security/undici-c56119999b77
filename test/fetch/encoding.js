'use strict'

const { test, skip } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const { nodeMajor, nodeMinor } = require('../../lib/core/util')
const { fetch } = require('../..')
const { createBrotliCompress, createGzip, createDeflate } = require('zlib')

// `npm run test:fetch` gates this directory behind `verifyVersion.js 16`, but the
// file can also be handed to `tap` directly, where `fetch` is not exported yet.
if (nodeMajor < 16 || (nodeMajor === 16 && nodeMinor < 8)) {
  skip('fetch is not supported in node < v16.8.0')
  process.exit()
}

test('content-encoding header is case-iNsENsITIve', async (t) => {
  const contentCodings = 'GZiP, bR'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const brotli = createBrotliCompress()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    brotli.pipe(gzip).pipe(res)

    brotli.write(text)
    brotli.end()
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const response = await fetch(`http://127.0.0.1:${server.address().port}`, { keepalive: false })

  t.equal(await response.text(), text)
  t.equal(response.headers.get('content-encoding'), contentCodings)
})

test('response decompression according to content-encoding should be handled in a correct order', async (t) => {
  const contentCodings = 'deflate, gzip'
  const text = 'Hello, World!'

  const server = createServer((req, res) => {
    const gzip = createGzip()
    const deflate = createDeflate()

    res.setHeader('Content-Encoding', contentCodings)
    res.setHeader('Content-Type', 'text/plain')

    gzip.pipe(deflate).pipe(res)

    gzip.write(text)
    gzip.end()
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const response = await fetch(`http://127.0.0.1:${server.address().port}`, { keepalive: false })

  t.equal(await response.text(), text)
})

// CVE fix: Limit the number of content-encodings to prevent resource exhaustion
// Similar to urllib3 (GHSA-gm62-xv2j-4w53) and curl (CVE-2022-32206)
const MAX_CONTENT_ENCODINGS = 5

// Serves a response whose `Content-Encoding` chain is `count` long. The chain is
// never actually applied to the body — an unpatched undici still allocates one
// decoder per coding while parsing the header, which is the exhaustion vector.
function startEncodingServer (t, coding, count) {
  const server = createServer((req, res) => {
    res.setHeader('Content-Encoding', Array(count).fill(coding).join(', '))
    res.setHeader('Content-Type', 'text/plain')

    res.end('test')
  }).listen(0, '127.0.0.1')

  t.teardown(server.close.bind(server))

  return server
}

async function fetchWithEncodings (t, coding, count) {
  const server = startEncodingServer(t, coding, count)
  await once(server, 'listening')

  return fetch(`http://127.0.0.1:${server.address().port}`, { keepalive: false })
}

test(`should allow exactly ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
  t.plan(2)

  const response = await fetchWithEncodings(t, 'identity', MAX_CONTENT_ENCODINGS)

  t.equal(response.status, 200)
  // identity encoding is a no-op, so the body should be passed through
  t.equal(await response.text(), 'test')
})

test(`should reject more than ${MAX_CONTENT_ENCODINGS} content-encodings`, async (t) => {
  t.plan(3)

  const count = MAX_CONTENT_ENCODINGS + 1

  try {
    await fetchWithEncodings(t, 'identity', count)
    t.fail('fetch should have rejected')
  } catch (err) {
    t.equal(err.name, 'TypeError')
    t.ok(err.cause, 'error has a cause')
    t.equal(
      err.cause.message,
      `too many content-encodings in response: ${count}, maximum allowed is ${MAX_CONTENT_ENCODINGS}`
    )
  }
})

test('should reject excessive content-encoding chains', async (t) => {
  t.plan(2)

  try {
    await fetchWithEncodings(t, 'identity', 100)
    t.fail('fetch should have rejected')
  } catch (err) {
    t.ok(err.cause, 'error has a cause')
    t.equal(
      err.cause.message,
      `too many content-encodings in response: 100, maximum allowed is ${MAX_CONTENT_ENCODINGS}`
    )
  }
})

test('should reject excessive chains of decompressing content-encodings', async (t) => {
  t.plan(2)

  // `identity` is unsupported here and short-circuits the decoder loop, whereas
  // every `gzip` coding really does allocate its own zlib stream without the limit.
  try {
    await fetchWithEncodings(t, 'gzip', 100)
    t.fail('fetch should have rejected')
  } catch (err) {
    t.ok(err.cause, 'error has a cause')
    t.equal(
      err.cause.message,
      `too many content-encodings in response: 100, maximum allowed is ${MAX_CONTENT_ENCODINGS}`
    )
  }
})
