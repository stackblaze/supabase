import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FileSystemFunctionsArtifactStore } from './fileSystemStore'

describe('FileSystemFunctionsArtifactStore', () => {
  let rootDir: string

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), 'functions-store-'))
  })

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  describe('when the functions folder does not exist', () => {
    it('getFunctions returns an empty list', async () => {
      const store = new FileSystemFunctionsArtifactStore(path.join(rootDir, 'missing'))

      await expect(store.getFunctions()).resolves.toEqual([])
    })

    it('getFunctionBySlug returns undefined', async () => {
      const store = new FileSystemFunctionsArtifactStore(path.join(rootDir, 'missing'))

      await expect(store.getFunctionBySlug('hello')).resolves.toBeUndefined()
    })
  })

  describe('when no functions folder is configured', () => {
    const store = new FileSystemFunctionsArtifactStore(undefined)

    it('getFunctions returns an empty list', async () => {
      await expect(store.getFunctions()).resolves.toEqual([])
    })

    it('getFunctionBySlug returns undefined', async () => {
      await expect(store.getFunctionBySlug('hello')).resolves.toBeUndefined()
    })

    it('getFileEntriesBySlug returns an empty list', async () => {
      await expect(store.getFileEntriesBySlug('hello')).resolves.toEqual([])
    })
  })

  it('rethrows errors other than a missing folder', async () => {
    const filePath = path.join(rootDir, 'not-a-folder')
    await writeFile(filePath, '')
    const store = new FileSystemFunctionsArtifactStore(filePath)

    await expect(store.getFunctions()).rejects.toMatchObject({ code: 'ENOTDIR' })
  })

  it('lists functions that have an index entrypoint, skipping main', async () => {
    await mkdir(path.join(rootDir, 'hello'))
    await writeFile(path.join(rootDir, 'hello', 'index.ts'), '')
    await mkdir(path.join(rootDir, 'main'))
    await writeFile(path.join(rootDir, 'main', 'index.ts'), '')
    await mkdir(path.join(rootDir, 'no-entrypoint'))
    const store = new FileSystemFunctionsArtifactStore(rootDir)

    const functions = await store.getFunctions()

    expect(functions.map((f) => f.slug)).toEqual(['hello'])
  })
})

describe('FileSystemFunctionsArtifactStore writes', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'edge-functions-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  it('writes a function folder that the listing then reports', async () => {
    const store = new FileSystemFunctionsArtifactStore(folder)
    const written = await store.writeFunction('hello', [
      { relativePath: 'index.ts', content: 'Deno.serve(() => new Response("hi"))' },
      { relativePath: 'lib/util.ts', content: 'export const x = 1' },
    ])
    expect(written).toBe(true)
    expect(await readFile(path.join(folder, 'hello', 'lib', 'util.ts'), 'utf8')).toBe(
      'export const x = 1'
    )
    expect((await store.getFunctions()).map((f) => f.slug)).toEqual(['hello'])
  })

  it('refuses file paths that escape the function folder', async () => {
    const store = new FileSystemFunctionsArtifactStore(folder)
    await expect(
      store.writeFunction('hello', [{ relativePath: '../outside.ts', content: 'x' }])
    ).rejects.toThrow(/Invalid file path/)
    await expect(
      store.writeFunction('hello', [{ relativePath: '/etc/passwd', content: 'x' }])
    ).rejects.toThrow(/Invalid file path/)
  })

  it('refuses slugs that are not plain folder names, and the router folder', async () => {
    const store = new FileSystemFunctionsArtifactStore(folder)
    const file = { relativePath: 'index.ts', content: 'x' }
    expect(await store.writeFunction('../up', [file])).toBe(false)
    expect(await store.writeFunction('a/b', [file])).toBe(false)
    expect(await store.writeFunction('main', [file])).toBe(false)
  })

  it('deletes a function folder and reports a missing one', async () => {
    const store = new FileSystemFunctionsArtifactStore(folder)
    await store.writeFunction('bye', [{ relativePath: 'index.ts', content: 'x' }])
    expect(await store.deleteFunction('bye')).toBe(true)
    await expect(stat(path.join(folder, 'bye'))).rejects.toThrow()
    expect(await store.deleteFunction('bye')).toBe(false)
  })
})

describe('FileSystemFunctionsArtifactStore without a functions folder', () => {
  it('refuses to write or delete', async () => {
    const store = new FileSystemFunctionsArtifactStore(undefined)
    expect(await store.writeFunction('hello', [{ relativePath: 'index.ts', content: 'x' }])).toBe(
      false
    )
    expect(await store.deleteFunction('hello')).toBe(false)
  })
})
