import type { Dirent } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { FunctionArtifact, FunctionFileEntry, FunctionFileInput } from './types'

export class FileSystemFunctionsArtifactStore {
  constructor(private folderPath: string) {}

  async getFunctions(): Promise<FunctionArtifact[]> {
    const dirEntries = await readdir(this.folderPath, { withFileTypes: true })

    const functionsFolders = dirEntries.filter((dir) => dir.isDirectory() && dir.name !== 'main')
    const functionsArtifacts = await Promise.all(
      functionsFolders.map(parseFolderToFunctionArtifact)
    )

    return functionsArtifacts.filter((f) => f !== undefined)
  }

  async getFunctionBySlug(slug: string): Promise<FunctionArtifact | undefined> {
    const dirEntries = await readdir(this.folderPath, { withFileTypes: true })

    const functionFolder = dirEntries.find(
      (dir) => dir.isDirectory() && dir.name !== 'main' && dir.name === slug
    )
    if (!functionFolder) return

    return parseFolderToFunctionArtifact(functionFolder)
  }

  async getFileEntriesBySlug(slug: string): Promise<Array<FunctionFileEntry>> {
    if (slug === 'main') return []

    const functionFolderPath = path.resolve(this.folderPath, slug)
    if (!functionFolderPath.startsWith(path.resolve(this.folderPath) + path.sep)) return []

    const entries = await readdir(functionFolderPath, {
      recursive: true,
      withFileTypes: true,
    })

    const fileEntries = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const absolutePath = path.join(entry.parentPath, entry.name)
          const fileStat = await stat(absolutePath)
          return {
            absolutePath,
            relativePath: path.relative(functionFolderPath, absolutePath),
            size: fileStat.size,
          }
        })
    )

    return fileEntries
  }

  /**
   * Write a function's files under `<folder>/<slug>`, replacing files of the
   * same name and leaving others in place. Returns false for a slug that is
   * not a plain folder name (or the `main` router); throws for a file path
   * that would land outside the function folder.
   */
  async writeFunction(slug: string, files: FunctionFileInput[]): Promise<boolean> {
    const functionFolderPath = this.folderForSlug(slug)
    if (!functionFolderPath || files.length === 0) return false

    const targets = files.map((file) => {
      const absolutePath = path.resolve(functionFolderPath, file.relativePath)
      if (
        path.isAbsolute(file.relativePath) ||
        !absolutePath.startsWith(functionFolderPath + path.sep)
      ) {
        throw new Error(`Invalid file path: ${file.relativePath}`)
      }
      return { absolutePath, content: file.content }
    })

    for (const target of targets) {
      await mkdir(path.dirname(target.absolutePath), { recursive: true })
      await writeFile(target.absolutePath, target.content)
    }
    return true
  }

  /** Remove `<folder>/<slug>`. Returns false when there was nothing to remove. */
  async deleteFunction(slug: string): Promise<boolean> {
    const functionFolderPath = this.folderForSlug(slug)
    if (!functionFolderPath) return false
    try {
      await stat(functionFolderPath)
    } catch {
      return false
    }
    await rm(functionFolderPath, { recursive: true, force: true })
    return true
  }

  /** Absolute folder for a slug; undefined unless the slug is a plain folder name. */
  private folderForSlug(slug: string): string | undefined {
    if (slug === 'main' || !/^[A-Za-z0-9_-]+$/.test(slug)) return
    return path.resolve(this.folderPath, slug)
  }
}

async function parseFolderToFunctionArtifact(
  folder: Dirent
): Promise<FunctionArtifact | undefined> {
  const folderPath = path.join(folder.parentPath, folder.name)
  const files = await readdir(folderPath, { withFileTypes: true })
  const entrypoint = files.find((file) => file.isFile() && file.name.startsWith('index'))

  if (!entrypoint) return

  const entrypointPath = path.join(folderPath, entrypoint.name)
  const entrypointStat = await stat(entrypointPath)

  return {
    slug: folder.name,
    entrypoint_path: pathToFileURL(entrypointPath).href,
    created_at: entrypointStat.birthtimeMs,
    updated_at: entrypointStat.mtimeMs,
  }
}
