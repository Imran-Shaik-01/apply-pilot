import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const manifests = [
  { path: resolve('manifest.json'), root: process.cwd(), label: 'repository' },
  { path: resolve('dist/manifest.json'), root: resolve('dist'), label: 'built' },
]

for (const { path, root, label } of manifests) {
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  const referencedFiles = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.action?.default_icon ?? {}),
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.content_scripts ?? []).flatMap((script) => script.js ?? []),
  ].filter(Boolean)

  for (const file of referencedFiles) {
    try {
      await readFile(resolve(root, file))
    } catch {
      throw new Error(`The ${label} manifest references a missing file: ${file}`)
    }
  }

  for (const script of manifest.content_scripts ?? []) {
    for (const file of script.js ?? []) {
      const source = await readFile(resolve(root, file), 'utf8')
      if (/^\s*(?:import|export)(?:\s|\{|\*|\()/m.test(source)) {
        throw new Error(`The ${label} content script must be standalone: ${file}`)
      }
    }
  }
}

console.log('Repository and built extension manifests reference available, loadable files.')
