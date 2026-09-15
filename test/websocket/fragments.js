'use strict'

const { test, skip } = require('tap')
const { WebSocketServer } = require('ws')
const { Agent, WebSocket } = require('../..')
const diagnosticsChannel = require('diagnostics_channel')
const { nodeMajor } = require('../../lib/core/util')

if (nodeMajor < 18) {
  skip('websockets are not supported in node < v18')
  process.exit()
}

test('Fragmented frame with a ping frame in the middle of it', (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x01, 0x03, 0x48, 0x65, 0x6c])) // Text frame "Hel"
    socket.write(Buffer.from([0x89, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f])) // ping "Hello"
    socket.write(Buffer.from([0x80, 0x02, 0x6c, 0x6f])) // Text frame "lo"
  })

  t.teardown(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('message', ({ data }) => {
    t.same(data, 'Hello')

    ws.close()
  })

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(
    ({ payload }) => t.same(payload, Buffer.from('Hello'))
  )
})

test('maxFragments is exposed on the dispatcher, with a default', (t) => {
  t.plan(2)

  const defaultAgent = new Agent()
  const configuredAgent = new Agent({ webSocket: { maxFragments: 3 } })

  t.teardown(() => Promise.all([defaultAgent.destroy(), configuredAgent.destroy()]))

  t.equal(defaultAgent.webSocketOptions.maxFragments, 131072)
  t.equal(configuredAgent.webSocketOptions.maxFragments, 3)
})

test('Too many message fragments fails the websocket connection', (t) => {
  t.plan(2)

  const agent = new Agent({
    webSocket: {
      maxFragments: 3
    }
  })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    // A malicious server can keep a message open forever by never setting the
    // fin bit. Every frame is buffered in the parser's fragment list, so
    // without a cap the list - and the process' memory - grows without bound.
    for (let i = 0; i < 4; i++) {
      socket.write(Buffer.from([0x01, 0x01, 0x61])) // Text frame "a", fin=0
    }
  })

  t.teardown(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()

    return agent.destroy()
  })

  const client = new WebSocket(`ws://localhost:${server.address().port}`, {
    dispatcher: agent
  })

  client.addEventListener('message', () => {
    t.fail('no message should have been delivered')
  })

  client.addEventListener('error', () => {
    t.ok(true, 'the connection was failed')
  })

  client.addEventListener('close', (event) => {
    t.equal(event.code, 1006)
  })
})

test('Empty first fragment followed by non-empty continuation delivers the message', (t) => {
  t.plan(1)

  // RFC 6455 §5.4 allows zero-byte fragments. A conforming server that opens
  // a fragmented message with an empty frame must be honored: the parser must
  // recognize the in-progress fragmented message when the continuation arrives.
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.send('', { fin: false })
    ws.send('hello', { fin: true })
  })

  t.teardown(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('message', ({ data }) => {
    t.equal(data, 'hello')

    ws.close()
  })
})
