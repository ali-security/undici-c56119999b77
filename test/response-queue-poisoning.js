'use strict'

const { test } = require('tap')
const { once } = require('events')
const { createServer } = require('net')
const { Client } = require('..')

function readBody (body) {
  return new Promise((resolve, reject) => {
    let data = ''
    body.setEncoding('latin1')
    body.on('data', chunk => { data += chunk })
    body.on('end', () => resolve(data))
    body.on('error', reject)
  })
}

test('should not reuse an idle socket with buffered unsolicited response bytes', (t) => {
  t.plan(3)

  let responses = 0

  const server = createServer((socket) => {
    socket.on('data', () => {
      if (responses++ === 0) {
        // Response to /request1, immediately followed by an unsolicited
        // response the client never asked for. A vulnerable client keeps the
        // socket and hands the poison bytes to the next request.
        socket.write(
          'HTTP/1.1 200 OK\r\n' +
          'Connection: keep-alive\r\n' +
          'Keep-Alive: timeout=300\r\n' +
          'Content-Length: 9\r\n' +
          '\r\n' +
          '/request1' +
          'HTTP/1.1 200 OK\r\n' +
          'Poison-Free-Socket: true\r\n' +
          'Connection: keep-alive\r\n' +
          'Keep-Alive: timeout=300\r\n' +
          'Content-Length: 0\r\n' +
          '\r\n'
        )
      } else {
        socket.end(
          'HTTP/1.1 200 OK\r\n' +
          'Connection: close\r\n' +
          'Content-Length: 9\r\n' +
          '\r\n' +
          '/request2'
        )
      }
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, '127.0.0.1', async () => {
    const client = new Client(`http://127.0.0.1:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    t.teardown(client.close.bind(client))

    const disconnected = once(client, 'disconnect')

    const response1 = await client.request({ path: '/request1', method: 'GET' })
    t.equal(await readBody(response1.body), '/request1')

    // The poison bytes must have torn the socket down rather than been
    // parsed as somebody else's response.
    await disconnected

    const response2 = await client.request({ path: '/request2', method: 'GET' })
    t.equal(response2.headers['poison-free-socket'], undefined)
    t.equal(await readBody(response2.body), '/request2')
  })
})

test('should not serve an unsolicited response to a queued request', (t) => {
  t.plan(3)

  // Request 2 is queued (but not yet written) while request 1 is still in
  // flight, so it sits at the head of the queue when the poison arrives.
  // Connection 1 answers request 1 and immediately appends an unsolicited
  // second response; connection 2 only ever answers legitimately.
  let connections = 0

  const server = createServer((socket) => {
    const poisoned = connections++ === 0

    socket.once('data', () => {
      if (poisoned) {
        socket.write(
          'HTTP/1.1 200 OK\r\n' +
          'Connection: keep-alive\r\n' +
          'Keep-Alive: timeout=300\r\n' +
          'Content-Length: 9\r\n' +
          '\r\n' +
          '/request1' +
          'HTTP/1.1 200 OK\r\n' +
          'Poison-Free-Socket: true\r\n' +
          'Connection: keep-alive\r\n' +
          'Keep-Alive: timeout=300\r\n' +
          'Content-Length: 7\r\n' +
          '\r\n' +
          'poison!'
        )
      } else {
        socket.end(
          'HTTP/1.1 200 OK\r\n' +
          'Connection: close\r\n' +
          'Content-Length: 9\r\n' +
          '\r\n' +
          '/request2'
        )
      }
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, '127.0.0.1', () => {
    const client = new Client(`http://127.0.0.1:${server.address().port}`, {
      keepAliveTimeout: 300e3,
      pipelining: 1
    })
    t.teardown(client.destroy.bind(client))

    // Do NOT await request 1's body — request 2 must already be queued.
    client.request({ path: '/request1', method: 'GET' }, (err, response1) => {
      t.error(err, 'request1 completes normally')
      if (!err) {
        response1.body.resume()
      }
    })

    client.request({ path: '/request2', method: 'GET' }, (err, response2) => {
      if (err) {
        // The poisoned socket must be torn down in a way that leaves the
        // still-unwritten request 2 retryable on a fresh connection.
        t.fail(`request2 must not be failed by the poisoned socket: ${err.name}: ${err.message}`)
        t.fail('request2 never received a response')
        return
      }

      t.equal(response2.headers['poison-free-socket'], undefined, 'request2 must not receive the unsolicited response headers')
      readBody(response2.body).then((body) => {
        t.equal(body, '/request2', 'request2 must receive its own response body')
      }, (err) => {
        t.fail(`request2 body errored: ${err.message}`)
      })
    })
  })
})
