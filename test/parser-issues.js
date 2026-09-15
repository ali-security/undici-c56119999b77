const net = require('net')
const { test } = require('tap')
const { Client, errors } = require('..')

// These servers write from timers that can still be pending once the client
// has torn the connection down. Writing after the other party's FIN throws
// EPIPE, which would surface as an uncaughtException rather than as the
// assertion the test is actually about.
function write (socket, data) {
  if (socket.destroyed || socket.readableEnded || socket.writableEnded) {
    return
  }
  socket.write(data)
}

function onConnection (fn) {
  return (socket) => {
    socket.on('error', () => {})
    // Wait for the request to be written. A response sent before any request
    // was made is unsolicited and is now rejected.
    socket.once('data', () => fn(socket))
  }
}

test('https://github.com/mcollina/undici/issues/268', (t) => {
  t.plan(2)

  const server = net.createServer(onConnection(socket => {
    write(socket, 'HTTP/1.1 200 OK\r\n')
    write(socket, 'Transfer-Encoding: chunked\r\n\r\n')
    setTimeout(() => {
      write(socket, '1\r\n')
      write(socket, '\n\r\n')
      setTimeout(() => {
        write(socket, '1\r\n')
        write(socket, '\n\r\n')
      }, 500)
    }, 500)
  }))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      method: 'GET',
      path: '/nxt/_changes?feed=continuous&heartbeat=5000',
      headersTimeout: 1e3
    }, (err, data) => {
      t.error(err)
      data.body
        .resume()
      setTimeout(() => {
        t.pass()
        data.body.on('error', () => {})
      }, 2e3)
    })
  })
})

test('parser fail', (t) => {
  t.plan(2)

  const server = net.createServer(onConnection(socket => {
    write(socket, 'HTT/1.1 200 OK\r\n')
  }))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ok(err)
      t.type(err, errors.HTTPParserError)
    })
  })
})

test('split header field', (t) => {
  t.plan(2)

  const server = net.createServer(onConnection(socket => {
    write(socket, 'HTTP/1.1 200 OK\r\nA')
    setTimeout(() => {
      write(socket, 'SD: asd,asd\r\n\r\n\r\n')
    }, 100)
  }))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.error(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })
})

test('split header value', (t) => {
  t.plan(2)

  const server = net.createServer(onConnection(socket => {
    write(socket, 'HTTP/1.1 200 OK\r\nASD: asd')
    setTimeout(() => {
      write(socket, ',asd\r\n\r\n\r\n')
    }, 100)
  }))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.error(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })
})
