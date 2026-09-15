'use strict'
const { createServer } = require('node:http')
const { once } = require('node:events')

const tap = require('tap')

const { RetryHandler, Client } = require('..')
const { RequestHandler } = require('../lib/api/api-request')

tap.test('Should retry status code', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter++

        if (
          err.statusCode === 500 ||
          err.message.includes('other side closed')
        ) {
          setTimeout(done, 500)
          return
        }

        return done(err)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        req.destroy()
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
          t.equal(counter, 2)
        },
        onError () {
          t.fail()
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should use retry-after header for retries', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  let checkpoint
  const dispatchOptions = {
    method: 'PUT',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(429, {
          'retry-after': 1
        })
        res.end('rate limit')
        checkpoint = Date.now()
        counter++
        return
      case 1:
        res.writeHead(200)
        res.end('hello world!')
        t.ok(Date.now() - checkpoint >= 500)
        counter++
        return
      default:
        t.fail('unexpected request')
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'PUT',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should use retry-after header for retries (date)', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  let checkpoint
  const dispatchOptions = {
    method: 'PUT',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        res.writeHead(429, {
          'retry-after': new Date(
            new Date().setSeconds(new Date().getSeconds() + 1)
          ).toUTCString()
        })
        res.end('rate limit')
        checkpoint = Date.now()
        counter++
        return
      case 1:
        res.writeHead(200)
        res.end('hello world!')
        t.ok(Date.now() - checkpoint >= 1)
        counter++
        return
      default:
        t.fail('unexpected request')
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'PUT',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should retry with defaults', t => {
  let counter = 0
  const chunks = []
  const server = createServer()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        req.destroy()
        counter++
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        counter++
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        counter++
        return
      default:
        t.fail()
    }
  })

  t.plan(3)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )
  })
})

tap.test('Should handle 206 partial content', t => {
  const chunks = []
  let counter = 0

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.same(req.headers.range, 'bytes=3-')
      res.setHeader('content-range', 'bytes 3-5/6')
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const dispatchOptions = {
    retryOptions: {
      retry: function (err, _, done) {
        counter++

        if (err.code && err.code === 'UND_ERR_DESTROYED') {
          return done(false)
        }

        if (err.statusCode === 206) return done(err)

        setTimeout(done, 800)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(8)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onRequestSent () {
          t.pass()
        },
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'abcdef')
          t.equal(counter, 1)
        },
        onError () {
          t.fail()
        }
      }
    })

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should reject initial 206 partial content with mismatched content-length', t => {
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.equal(req.headers.range, 'bytes=100-199')
      res.statusCode = 206
      // content-range announces 100 bytes (100-199) while content-length claims 300:
      // the extra 200 bytes are smuggled past a client that trusts content-range
      res.setHeader('content-range', 'bytes 100-199/300')
      res.setHeader('content-length', '300')
      res.end('1'.repeat(300))
    } else {
      t.fail('should not perform a second request')
    }
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      range: 'bytes=100-199'
    }
  }

  t.plan(5)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.fail('should not forward the headers of a malformed 206')
          return true
        },
        onData (chunk) {
          t.fail('should not forward the body of a malformed 206')
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.equal(err.code, 'UND_ERR_REQ_RETRY')
          t.equal(err.message, 'Content-Length mismatch')
          t.equal(x, 1)
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should reject resumed 206 partial content with mismatched content-length', t => {
  const chunks = []

  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.same(req.headers.range, 'bytes=3-')
      // content-range announces 3 bytes (3-5) while content-length claims 6:
      // the extra 3 bytes are smuggled past a client that trusts content-range
      res.setHeader('content-range', 'bytes 3-5/6')
      res.setHeader('content-length', '6')
      res.setHeader('etag', 'asd')
      res.statusCode = 206
      res.end('defghi')
    } else {
      t.fail('should not perform a third request')
    }
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(6)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.pass()
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.equal(err.code, 'UND_ERR_REQ_RETRY')
          t.equal(err.message, 'Content-Length mismatch')
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should handle 206 partial content - bad-etag', t => {
  const chunks = []

  // Took from: https://github.com/nxtedition/nxt-lib/blob/4b001ebc2f22cf735a398f35ff800dd553fe5933/test/undici/retry.js#L47
  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.same(req.headers.range, 'bytes=3-')
      res.setHeader('content-range', 'bytes 3-5/6')
      res.setHeader('etag', 'erwsd')
      res.statusCode = 206
      res.end('def')
    }
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(6)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(
      dispatchOptions,
      {
        dispatch: (...args) => {
          return client.dispatch(...args)
        },
        handler: {
          onConnect () {
            t.pass()
          },
          onBodySent () {
            t.pass()
          },
          onHeaders (status, _rawHeaders, resume, _statusMessage) {
            t.pass()
            return true
          },
          onData (chunk) {
            chunks.push(chunk)
            return true
          },
          onComplete () {
            t.error('should not complete')
          },
          onError (err) {
            t.equal(Buffer.concat(chunks).toString('utf-8'), 'abc')
            t.equal(err.code, 'UND_ERR_REQ_RETRY')
          }
        }
      }
    )

    client.dispatch(
      {
        method: 'GET',
        path: '/',
        headers: {
          'content-type': 'application/json'
        }
      },
      handler
    )

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('#3900104 - Should not resume a 206 response without a usable content-range', t => {
  const chunks = []

  // The response is a partial one, but its content-range is unusable, so the
  // handler forwards it downstream as-is without checkpointing a resume point.
  // Retrying it would splice the bytes of a second response into a response
  // whose headers were already handed to the caller.
  let x = 0
  const server = createServer((req, res) => {
    t.equal(x, 0, 'must not retry an uncheckpointed partial response')
    res.statusCode = 206
    res.setHeader('content-length', '2')
    res.setHeader('content-range', 'bytes 0-999')
    res.write('1')
    setTimeout(() => {
      res.destroy()
    }, 1e2)
    x++
  })

  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(5)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 206)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.ok(err, 'should forward the socket error downstream')
          t.equal(x, 1, 'should not have re-dispatched the request')
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('#4970 - Should reject resumed partial content when body exceeds Content-Range', t => {
  const chunks = []
  const injectedResponse =
    'HTTP/1.1 302 Found\r\nLocation: http://evil.com\r\nContent-Length: 0\r\n\r\n'

  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('content-length', '5')
      res.setHeader('etag', '123')
      res.write('use')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.equal(req.headers.range, 'bytes=3-5')
      res.statusCode = 206
      res.setHeader('etag', '123')
      // content-range announces 3 bytes (3-5) while the body smuggles a whole
      // extra response after them
      res.setHeader('content-range', 'bytes 3-5/6')
      res.end(`r1${injectedResponse}`)
    } else {
      t.fail('should not perform a third request')
    }
    x++
  })

  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        if (err.message.includes('other side closed')) {
          setTimeout(done, 1e2)
          return
        }

        return done(err)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(7)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.equal(err.code, 'UND_ERR_REQ_RETRY')
          t.equal(err.message, 'Content-Length mismatch')
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'use')
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should reject resumed 206 partial content starting at the wrong offset', t => {
  const chunks = []

  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('content-length', '5')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.equal(req.headers.range, 'bytes=3-5')
      res.statusCode = 206
      res.setHeader('etag', 'asd')
      // the resumed range does not start where the first response left off:
      // appending it would splice foreign bytes into the forwarded body
      res.setHeader('content-range', 'bytes 4-6/7')
      res.end('def')
    } else {
      t.fail('should not perform a third request')
    }
    x++
  })

  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        if (err.message.includes('other side closed')) {
          setTimeout(done, 1e2)
          return
        }

        return done(err)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(7)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.equal(err.code, 'UND_ERR_REQ_RETRY')
          t.equal(err.message, 'Content-Range mismatch')
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'abc')
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should reject resumed 206 partial content ending past the checkpoint', t => {
  const chunks = []

  let x = 0
  const server = createServer((req, res) => {
    if (x === 0) {
      t.pass()
      res.setHeader('content-length', '5')
      res.setHeader('etag', 'asd')
      res.write('abc')
      setTimeout(() => {
        res.destroy()
      }, 1e2)
    } else if (x === 1) {
      t.equal(req.headers.range, 'bytes=3-5')
      res.statusCode = 206
      res.setHeader('etag', 'asd')
      // the resumed range claims to end well past the checkpointed end: the
      // extra bytes would be appended to the already forwarded body
      res.setHeader('content-range', 'bytes 3-9/10')
      res.end('defghij')
    } else {
      t.fail('should not perform a third request')
    }
    x++
  })

  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        if (err.message.includes('other side closed')) {
          setTimeout(done, 1e2)
          return
        }

        return done(err)
      }
    },
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(7)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.fail('should not complete')
        },
        onError (err) {
          t.equal(err.code, 'UND_ERR_REQ_RETRY')
          t.equal(err.message, 'Content-Range mismatch')
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'abc')
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('Should not reject a HEAD response with content-length', t => {
  const chunks = []

  let x = 0
  const server = createServer((req, res) => {
    t.equal(x, 0, 'should perform a single request')
    res.setHeader('content-length', '1234')
    res.end()
    x++
  })

  const dispatchOptions = {
    method: 'HEAD',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  t.plan(4)

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: (...args) => {
        return client.dispatch(...args)
      },
      handler: {
        onConnect () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), '')
        },
        onError (err) {
          t.error(err)
        }
      }
    })

    client.dispatch(dispatchOptions, handler)

    t.teardown(async () => {
      await client.close()

      server.close()
      await once(server, 'close')
    })
  })
})

tap.test('retrying a request with a body', t => {
  let counter = 0
  const server = createServer()
  const dispatchOptions = {
    retryOptions: {
      retry: (err, { state, opts }, done) => {
        counter++

        if (
          err.statusCode === 500 ||
          err.message.includes('other side closed')
        ) {
          setTimeout(done, 500)
          return
        }

        return done(err)
      }
    },
    method: 'POST',
    path: '/',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' })
  }

  t.plan(1)

  server.on('request', (req, res) => {
    switch (counter) {
      case 0:
        req.destroy()
        return
      case 1:
        res.writeHead(500)
        res.end('failed')
        return
      case 2:
        res.writeHead(200)
        res.end('hello world!')
        return
      default:
        t.fail()
    }
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const handler = new RetryHandler(dispatchOptions, {
      dispatch: client.dispatch.bind(client),
      handler: new RequestHandler(dispatchOptions, (err, data) => {
        t.error(err)
      })
    })

    t.teardown(async () => {
      await client.close()
      server.close()

      await once(server, 'close')
    })

    client.dispatch(
      {
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ hello: 'world' })
      },
      handler
    )
  })
})
