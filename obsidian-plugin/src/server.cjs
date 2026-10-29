const http = require('node:http')
const { createHash } = require('node:crypto')
const { deriveIndex } = require('./index.cjs')

const PROTOCOL_VERSION = 1
const revisionOf = text => createHash('sha256').update(text).digest('hex')
const DEFAULT_PORT = 27124
const DEFAULT_ORIGINS = ['https://panwanke.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'http://localhost:5175', 'http://127.0.0.1:5175']
const assetPattern = /\.(png|jpe?g|gif|svg|webp|avif|bmp|pdf|mp3|mp4|webm|wav|ogg|m4a|flac)$/i
const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', pdf: 'application/pdf', mp3: 'audio/mpeg', mp4: 'video/mp4' }

function safePath(value) {
  if (!value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) || value.includes('\0')) return false
  return !value.includes(':')
}

async function vaultSnapshot(app, vaultId) {
  let settings = {}
  try { settings = JSON.parse(await app.vault.adapter.read(`${app.vault.configDir}/app.json`)) } catch { /* Missing settings use defaults. */ }
  const raw = settings.attachmentFolderPath
  const folder = raw === './' || raw === '.' ? '.' : typeof raw === 'string' ? raw.replace(/^\/+|\/+$/g, '') : ''
  const info = file => ({ path: file.path, mtime: file.stat.mtime, size: file.stat.size })
  return {
    name: app.vault.getName(), vaultId,
    files: app.vault.getMarkdownFiles().filter(file => safePath(file.path)).map(info),
    attachments: app.vault.getFiles().filter(file => safePath(file.path) && assetPattern.test(file.path)).map(info),
    config: { attachmentFolder: folder, attachmentExplicit: typeof raw === 'string', useMarkdownLinks: settings.useMarkdownLinks === true, newLinkFormat: ['relative', 'absolute'].includes(settings.newLinkFormat) ? settings.newLinkFormat : 'shortest', inferred: false },
  }
}

async function startBridge(app, settings = {}) {
  const clients = new Set()
  const pending = []
  let timer
  let closed = false
  const origins = settings.origins ?? DEFAULT_ORIGINS
  const vaultId = createHash('sha256').update(app.vault.adapter.getBasePath?.() ?? app.vault.getName()).digest('hex')
  const server = http.createServer(async (request, response) => {
    const json = (status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(data)) }
    const fail = (status, code, message) => json(status, { error: { code, message } })
    // Reject unexpected Host values as well as origins to prevent DNS rebinding.
    if (request.headers.host !== `127.0.0.1:${server.address()?.port}`) return fail(403, 'HOST_DENIED', 'Loopback host required')
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) return fail(403, 'ORIGIN_DENIED', 'Origin is not allowed')
    response.setHeader('Access-Control-Allow-Origin', origin ?? origins[0] ?? 'https://panwanke.github.io')
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, If-Match')
    response.setHeader('Access-Control-Expose-Headers', 'X-MarkPage-Revision')
    response.setHeader('Cache-Control', 'no-store')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    if (!['GET', 'PUT'].includes(request.method)) return fail(405, 'READ_ONLY', 'The bridge is read-only')
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      if (request.method === 'PUT' && url.pathname !== '/v1/file') return fail(405, 'READ_ONLY', 'Only note updates support PUT')
      if (url.pathname === '/v1/health') return json(200, { protocolVersion: PROTOCOL_VERSION, version: '0.2.1', writeEnabled: settings.allowWrites === true, writable: settings.allowWrites === true && Boolean(origin && settings.writeToken && request.headers.authorization === `Bearer ${settings.writeToken}`), name: app.vault.getName(), vaultId })
      if (url.pathname === '/v1/vault') return json(200, await vaultSnapshot(app, vaultId))
      if (url.pathname === '/v1/index') return json(200, deriveIndex(app))
      if (url.pathname === '/v1/events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' })
        response.write('event: ready\ndata: {}\n\n')
        clients.add(response)
        response.on('close', () => clients.delete(response))
        return
      }
      if (url.pathname === '/v1/file' && request.method === 'PUT') {
        if (!settings.allowWrites) return fail(403, 'READ_ONLY', 'Enable writing in the companion plugin')
        if (!origin || !origins.includes(origin) || !settings.writeToken || request.headers.authorization !== `Bearer ${settings.writeToken}`) return fail(403, 'WRITE_DENIED', 'A paired browser and write token are required')
        const filePath = url.searchParams.get('path')
        if (!safePath(filePath) || !/\.md$/i.test(filePath) || filePath.startsWith(`${app.vault.configDir}/`)) return fail(400, 'INVALID_PATH', 'An existing Markdown path is required')
        const chunks = []
        let bytes = 0
        for await (const chunk of request) {
          chunks.push(chunk)
          bytes += chunk.length
          if (bytes > 2 * 1024 * 1024) return fail(413, 'TOO_LARGE', 'Write exceeds 2 MB')
        }
        let payload
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return fail(400, 'INVALID_WRITE', 'Invalid JSON') }
        if (!payload || typeof payload !== 'object') return fail(400, 'INVALID_WRITE', 'Invalid write payload')
        const expected = request.headers['if-match']
        if (payload.vaultId !== vaultId || typeof payload.content !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) return fail(400, 'INVALID_WRITE', 'Vault, revision and text are required')
        const file = app.vault.getFileByPath(filePath)
        if (!file) return fail(404, 'NOT_FOUND', 'The note no longer exists')
        // Check inside Vault.process: no asynchronous gap between comparison and replacement.
        try {
          await app.vault.process(file, current => {
            if (closed || !settings.allowWrites) throw new Error('READ_ONLY')
            if (settings.nativeBusy?.(file, current)) throw new Error('NATIVE_BUSY')
            if (current === payload.content) return current
            if (revisionOf(current) !== expected) throw new Error('CONFLICT')
            return payload.content
          })
        } catch (error) {
          if (['CONFLICT', 'NATIVE_BUSY', 'READ_ONLY'].includes(error.message)) return fail(409, error.message, error.message)
          throw error
        }
        return json(200, { revision: revisionOf(payload.content) })
      }
      if (request.method !== 'GET') return fail(405, 'READ_ONLY', 'Only note updates support PUT')
      if (url.pathname === '/v1/file') {
        const filePath = url.searchParams.get('path')
        if (!safePath(filePath) || filePath === app.vault.configDir || filePath.startsWith(`${app.vault.configDir}/`)) return fail(400, 'INVALID_PATH', 'A visible vault-relative path is required')
        const file = app.vault.getFileByPath(filePath)
        if (!file || !(/\.md$/i.test(filePath) || assetPattern.test(filePath))) return fail(404, 'NOT_FOUND', 'File is not available')
        if (/\.md$/i.test(filePath)) {
          const content = await app.vault.read(file)
          response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'X-MarkPage-Revision': revisionOf(content) })
          response.end(content)
        } else {
          response.writeHead(200, { 'Content-Type': mimeTypes[file.extension] ?? 'application/octet-stream' })
          response.end(Buffer.from(await app.vault.readBinary(file)))
        }
        return
      }
      // TODO(b2): Commands, full-text search and multiple vaults require separate capabilities.
      return fail(404, 'NOT_FOUND', 'Unknown endpoint')
    } catch (error) {
      if (!response.headersSent) fail(500, 'READ_FAILED', String(error.message ?? error))
      else response.end()
    }
  })
  let port = settings.port ?? DEFAULT_PORT
  for (let attempt = 0; ; attempt += 1) {
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
      })
      port = server.address().port
      break
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt >= 9 || port >= 65535) throw error
      port += 1
    }
  }
  const heartbeat = setInterval(() => { clients.forEach(client => client.write(': keepalive\n\n')) }, 15000)
  return {
    port, vaultId, writeEnabled: settings.allowWrites === true,
    broadcast(event) {
      pending.push(event)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const events = pending.splice(0)
        clients.forEach(client => client.write(`event: changes\ndata: ${JSON.stringify(events)}\n\n`))
      }, 300)
    },
    async close() {
      closed = true
      clearTimeout(timer); clearInterval(heartbeat)
      clients.forEach(client => client.end()); clients.clear()
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    },
  }
}

module.exports = { startBridge, vaultSnapshot, PROTOCOL_VERSION, DEFAULT_PORT, DEFAULT_ORIGINS }
