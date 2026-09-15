'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const net = require('net')

test('CRLF injection in upgrade header via CRLF sequence', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\r\n\r\nSET pwned true'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'invalid upgrade header')
    }
  })
})

test('CRLF injection in upgrade header via lone CR', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\rinjected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'invalid upgrade header')
    }
  })
})

test('CRLF injection in upgrade header via lone LF', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\ninjected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'invalid upgrade header')
    }
  })
})

test('CRLF injection in upgrade header via null byte', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\0injected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'invalid upgrade header')
    }
  })
})

test('CRLF injection in upgrade option via client.request', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    try {
      await client.request({
        path: '/',
        method: 'GET',
        upgrade: 'websocket\r\n\r\nGET /smuggled HTTP/1.1'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'invalid upgrade header')
    }
  })
})

test('valid upgrade value is accepted', (t) => {
  t.plan(1)

  const server = net.createServer((c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const { socket } = await client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'websocket'
    })
    t.ok(socket)
    socket.destroy()
  })
})
