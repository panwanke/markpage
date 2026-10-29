import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export const { startBridge, vaultSnapshot } = require('../../obsidian-plugin/src/server.cjs')
export const { deriveIndex } = require('../../obsidian-plugin/src/index.cjs')

export function fakeObsidian() {
  const contents: Record<string, string> = { 'A.md': '[[B]]', 'B.md': '# B\ntext ^block' }
  const files = Object.entries(contents).map(([path, content]) => ({ path, extension: 'md', stat: { mtime: 1, size: Buffer.byteLength(content) } }))
  const caches: Record<string, unknown> = {
    'A.md': { links: [{ link: 'B', original: '[[B]]' }] },
    'B.md': { headings: [{ heading: 'B', level: 1 }], blocks: { block: { id: 'block' } } },
  }
  return {
    contents, caches,
    vault: {
      configDir: '.obsidian', getName: () => 'Test vault', getMarkdownFiles: () => files, getFiles: () => files,
      getFileByPath: (path: string) => files.find(file => file.path === path),
      read: async (file: { path: string }) => contents[file.path],
      process: async (file: { path: string }, update: (text: string) => string) => { contents[file.path] = update(contents[file.path]) },
      cachedRead: async (file: { path: string }) => contents[file.path],
      adapter: { getBasePath: () => '/fixtures/test', read: async () => JSON.stringify({ attachmentFolderPath: 'attachments' }) },
    },
    metadataCache: {
      getFileCache: (file: { path: string }) => caches[file.path],
      getFirstLinkpathDest: (target: string) => files.find(file => file.path === `${target}.md` || file.path === target),
      resolvedLinks: { 'A.md': { 'B.md': 1 } }, unresolvedLinks: {},
    },
  }
}

export async function fakeBridge(protocolVersion = 1) {
  const app = fakeObsidian()
  const vault = await vaultSnapshot(app, 'fixture-vault')
  const index = deriveIndex(app)
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/v1/health') response.end(JSON.stringify({ protocolVersion, version: '0.1.0', name: vault.name, vaultId: vault.vaultId }))
    else if (request.url === '/v1/vault') response.end(JSON.stringify(vault))
    else if (request.url === '/v1/index') response.end(JSON.stringify(index))
    else if (request.url?.startsWith('/v1/file?')) response.end('[[B]]')
    else { response.writeHead(404); response.end('{}') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { app, vault, index, port: (server.address() as AddressInfo).port, close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }) }
}
