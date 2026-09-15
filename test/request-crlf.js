'use strict'

const { createServer } = require('http')
const { Blob } = require('buffer')
const { test } = require('tap')
const { request, errors } = require('..')

test('should validate content-type CRLF Injection', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.fail('should not receive any request')
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    try {
      await request(`http://localhost:${server.address().port}`, {
        method: 'GET',
        headers: {
          'content-type': 'application/json\r\n\r\nGET /foo2 HTTP/1.1'
        }
      })
      t.fail('request should fail')
    } catch (e) {
      t.type(e, errors.InvalidArgumentError)
      t.equal(e.message, 'invalid content-type header')
    }
  })
})

test('should validate blob body content-type CRLF Injection', { skip: !Blob }, (t) => {
  t.plan(3)

  let receivedRequest = false
  const server = createServer((req, res) => {
    receivedRequest = true
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  class MaliciousBlob extends Blob {
    get type () {
      return 'text/html\r\nX-Injected: true'
    }
  }

  server.listen(0, async () => {
    try {
      await request(`http://localhost:${server.address().port}/endpoint`, {
        method: 'POST',
        body: new MaliciousBlob(['hello'])
      })
      t.fail('request should fail')
    } catch (e) {
      t.type(e, errors.InvalidArgumentError)
      t.equal(e.message, 'invalid content-type header')
    }
    t.equal(receivedRequest, false)
  })
})

test('should validate blob-like body content-type CRLF Injection', (t) => {
  t.plan(3)

  let receivedRequest = false
  const server = createServer((req, res) => {
    receivedRequest = true
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  // Duck-typed blob-like body, matching util.isBlobLike. Works on every
  // supported node version, including those without a Blob implementation.
  const maliciousBlobLike = {
    size: 5,
    get type () {
      return 'text/html\r\nX-Injected: true'
    },
    async arrayBuffer () {
      return new Uint8Array([104, 101, 108, 108, 111]).buffer
    },
    get [Symbol.toStringTag] () {
      return 'Blob'
    }
  }

  server.listen(0, async () => {
    try {
      await request(`http://localhost:${server.address().port}/endpoint`, {
        method: 'POST',
        body: maliciousBlobLike
      })
      t.fail('request should fail')
    } catch (e) {
      t.type(e, errors.InvalidArgumentError)
      t.equal(e.message, 'invalid content-type header')
    }
    t.equal(receivedRequest, false)
  })
})

test('should allow a valid blob body content-type', { skip: !Blob }, (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.equal(req.headers['content-type'], 'text/plain')
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const { statusCode } = await request(`http://localhost:${server.address().port}/endpoint`, {
      method: 'POST',
      body: new Blob(['hello'], { type: 'text/plain' })
    })
    t.equal(statusCode, 200)
  })
})
