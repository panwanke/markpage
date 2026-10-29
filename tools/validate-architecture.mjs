import { readFile, readdir, realpath } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
  }))
  return files.flat()
}

function inside(path, directory) {
  const pathFromRoot = relative(directory, path)
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !pathFromRoot.includes(':'))
}

function imports(source, path) {
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const found = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      found.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

async function readManifests(root, subdir, isApp) {
  const entries = await readdir(join(root, subdir), { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const found = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const directory = join(root, subdir, entry.name)
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
    found.push({ directory, isApp, ...manifest })
  }
  return found
}

/** Validate package direction and every cross-package import against explicit exports. */
export async function validateArchitecture(root) {
  root = resolve(root)
  const errors = []
  const packages = [...await readManifests(root, 'packages', false), ...await readManifests(root, 'apps', true)]
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const ownerOf = (path) => packages.find((pkg) => inside(path, pkg.directory))
  const allowed = {
    '@markpage/core': [],
    '@markpage/editor': ['@markpage/core'],
    '@markpage/extension-obsidian': ['@markpage/core'],
    // A host app assembles every layer and is the only place allowed to touch obsidian/react/builtins.
    '@markpage/obsidian': ['@markpage/core', '@markpage/editor', '@markpage/extension-obsidian'],
  }
  for (const pkg of packages) {
    if (!pkg.private) errors.push(`${pkg.name}: shared packages must be private`)
    const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies }
    for (const dependency of Object.keys(dependencies)) {
      if (byName.has(dependency) && !allowed[pkg.name]?.includes(dependency)) {
        errors.push(`${pkg.name}: forbidden dependency on ${dependency}`)
      }
      if (!pkg.isApp && pkg.name !== '@markpage/editor' && (dependency === 'obsidian' || dependency.startsWith('react'))) {
        errors.push(`${pkg.name}: forbidden host/UI dependency ${dependency}`)
      }
    }
  }
  const files = [...await sourceFiles(join(root, 'src'))]
  for (const pkg of packages) files.push(...await sourceFiles(join(pkg.directory, 'src')))
  for (const path of files) {
    const owner = ownerOf(path)
    const source = await readFile(path, 'utf8')
    const specifiers = imports(source, path)
    if (relative(root, path).replaceAll('\\', '/') === 'src/lib/markdown.ts') {
      for (const specifier of specifiers) {
        if (!specifier.startsWith('@markpage/')) errors.push(`src/lib/markdown.ts: host adapter must use shared package imports, found ${specifier}`)
      }
      const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
      for (const node of tree.statements) {
        if (ts.isFunctionDeclaration(node) && !['parseMarkdown', 'getMarkdownParser'].includes(node.name?.text)) {
          errors.push(`src/lib/markdown.ts: parser algorithms must live in core (${node.name?.text})`)
        }
      }
    }
    for (const specifier of specifiers) {
      const location = relative(root, path).replaceAll('\\', '/')
      if (specifier.startsWith('.')) {
        const target = resolve(dirname(path), specifier)
        if (owner ? !inside(target, owner.directory) : !!ownerOf(target)) {
          errors.push(`${location}: cross-package relative import ${specifier}`)
        }
      }
      if (owner && !owner.isApp && (specifier === 'obsidian' || isBuiltin(specifier)
        || (owner.name !== '@markpage/editor' && /^(react|react-dom)(\/|$)/.test(specifier)))) {
        errors.push(`${location}: forbidden host/UI import ${specifier}`)
      }
      if (!specifier.startsWith('@markpage/')) continue
      const [scope, name, ...parts] = specifier.split('/')
      const targetName = `${scope}/${name}`
      const target = byName.get(targetName)
      const exported = parts.length ? `./${parts.join('/')}` : '.'
      if (!target || !Object.hasOwn(target.exports ?? {}, exported)) errors.push(`${location}: private or unknown import ${specifier}`)
      if (owner && targetName !== owner.name && !allowed[owner.name]?.includes(targetName)) errors.push(`${location}: invalid dependency direction to ${targetName}`)
      if (owner && targetName !== owner.name && !owner.dependencies?.[targetName] && !owner.peerDependencies?.[targetName]) errors.push(`${location}: undeclared dependency ${targetName}`)
    }
  }
  // These algorithms have one owner. Reintroducing a web copy fails the gate.
  const migrated = ['history', 'hash', 'positions', 'frontmatter', 'palette', 'revision', 'export', 'highlight', 'links', 'obsidian-syntax', 'callouts', 'embeds', 'source-selection']
  const webFiles = new Set((await sourceFiles(join(root, 'src', 'lib'))).map((path) => relative(join(root, 'src', 'lib'), path)))
  for (const name of migrated) if (webFiles.has(`${name}.ts`)) errors.push(`src/lib/${name}.ts: migrated implementation must remain in its shared package`)
  return { packages: packages.map((pkg) => pkg.name), scannedFiles: files.length, errors }
}

if (process.argv[1] && await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url))) {
  const result = await validateArchitecture(process.cwd())
  if (result.errors.length) {
    console.error(result.errors.join('\n'))
    process.exitCode = 1
  } else console.log(`Architecture PASS: ${result.packages.length} packages, ${result.scannedFiles} production files.`)
}
