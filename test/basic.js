var concat = require('concat-stream')
var http = require('http')
var portfinder = require('portfinder')
var get = require('../')
var selfSignedHttps = require('self-signed-https')
var str = require('string-to-stream')
var test = require('tape')
var zlib = require('zlib')

// Allow self-signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

test('simple get', function (t) {
  t.plan(4)

  var server = http.createServer(function (req, res) {
    t.equal(req.url, '/path')
    res.statusCode = 200
    res.end('response')
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('http://localhost:' + port + '/path', function (err, res) {
        t.error(err)
        t.equal(res.statusCode, 200)
        res.pipe(concat(function (data) {
          t.equal(data.toString(), 'response')
          server.close()
        }))
      })
    })
  })
})

test('follow redirects (up to 10)', function (t) {
  t.plan(13)

  var num = 1
  var server = http.createServer(function (req, res) {
    t.equal(req.url, '/' + num, 'visited /' + num)
    num += 1

    if (num <= 10) {
      res.statusCode = 301
      res.setHeader('Location', '/' + num)
      res.end()
    } else {
      res.statusCode = 200
      res.end('response')
    }
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('http://localhost:' + port + '/1', function (err, res) {
        t.error(err)
        t.equal(res.statusCode, 200)
        res.pipe(concat(function (data) {
          t.equal(data.toString(), 'response')
          server.close()
        }))
      })
    })
  })
})

test('follow redirects (11 is too many)', function (t) {
  t.plan(11)

  var num = 1
  var server = http.createServer(function (req, res) {
    t.equal(req.url, '/' + num, 'visited /' + num)
    num += 1

    res.statusCode = 301
    res.setHeader('Location', '/' + num)
    res.end()
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('http://localhost:' + port + '/1', function (err) {
        t.ok(err instanceof Error, 'got error')
        server.close()
      })
    })
  })
})

test('custom headers', function (t) {
  t.plan(2)

  var server = http.createServer(function (req, res) {
    t.equal(req.headers['custom-header'], 'custom-value')
    res.statusCode = 200
    res.end('response')
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get({
        url: 'http://localhost:' + port,
        headers: {
          'custom-header': 'custom-value'
        }
      }, function (err, res) {
        t.error(err)
        res.resume()
        server.close()
      })
    })
  })
})

test('gzip response', function (t) {
  t.plan(3)

  var server = http.createServer(function (req, res) {
    res.statusCode = 200
    res.setHeader('content-encoding', 'gzip')
    str('response').pipe(zlib.createGzip()).pipe(res)
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('http://localhost:' + port, function (err, res) {
        t.error(err)
        t.equal(res.statusCode, 200) // statusCode still works on gunzip stream
        res.pipe(concat(function (data) {
          t.equal(data.toString(), 'response')
          server.close()
        }))
      })
    })
  })
})

test('deflate response', function (t) {
  t.plan(3)

  var server = http.createServer(function (req, res) {
    res.statusCode = 200
    res.setHeader('content-encoding', 'deflate')
    str('response').pipe(zlib.createDeflate()).pipe(res)
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('http://localhost:' + port, function (err, res) {
        t.error(err)
        t.equal(res.statusCode, 200) // statusCode still works on inflate stream
        res.pipe(concat(function (data) {
          t.equal(data.toString(), 'response')
          server.close()
        }))
      })
    })
  })
})

test('https', function (t) {
  t.plan(4)

  var server = selfSignedHttps(function (req, res) {
    t.equal(req.url, '/path')
    res.statusCode = 200
    res.end('response')
  })

  portfinder.getPort(function (err, port) {
    if (err) throw err
    server.listen(port, function () {
      get('https://localhost:' + port + '/path', function (err, res) {
        t.error(err)
        t.equal(res.statusCode, 200)
        res.pipe(concat(function (data) {
          t.equal(data.toString(), 'response')
          server.close()
        }))
      })
    })
  })
})

test('redirect https to http', function (t) {
  t.plan(5)

  var httpPort = null
  var httpsPort = null

  var httpsServer = selfSignedHttps(function (req, res) {
    t.equal(req.url, '/path1')
    res.statusCode = 301
    res.setHeader('Location', 'http://localhost:' + httpPort + '/path2')
    res.end()
  })

  var httpServer = http.createServer(function (req, res) {
    t.equal(req.url, '/path2')
    res.statusCode = 200
    res.end('response')
  })

  portfinder.getPort(function (err, _httpsPort) {
    if (err) throw err
    httpsPort = _httpsPort

    httpsServer.listen(httpsPort, function () {
      portfinder.getPort(function (err, _httpPort) {
        if (err) throw err
        httpPort = _httpPort

        httpServer.listen(httpPort, function () {
          get('https://localhost:' + httpsPort + '/path1', function (err, res) {
            t.error(err)
            t.equal(res.statusCode, 200)
            res.pipe(concat(function (data) {
              t.equal(data.toString(), 'response')
              httpsServer.close()
              httpServer.close()
            }))
          })
        })
      })
    })
  })
})

test('redirect http to https', function (t) {
  t.plan(5)

  var httpsPort = null
  var httpPort = null

  var httpServer = http.createServer(function (req, res) {
    t.equal(req.url, '/path1')
    res.statusCode = 301
    res.setHeader('Location', 'https://localhost:' + httpsPort + '/path2')
    res.end()
  })

  var httpsServer = selfSignedHttps(function (req, res) {
    t.equal(req.url, '/path2')
    res.statusCode = 200
    res.end('response')
  })

  portfinder.getPort(function (err, _httpPort) {
    if (err) throw err
    httpPort = _httpPort

    httpServer.listen(httpPort, function () {
      portfinder.getPort(function (err, _httpsPort) {
        if (err) throw err
        httpsPort = _httpsPort

        httpsServer.listen(httpsPort, function () {
          get('http://localhost:' + httpPort + '/path1', function (err, res) {
            t.error(err)
            t.equal(res.statusCode, 200)
            res.pipe(concat(function (data) {
              t.equal(data.toString(), 'response')
              httpsServer.close()
              httpServer.close()
            }))
          })
        })
      })
    })
  })
})
