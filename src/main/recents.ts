import { app } from 'electron'
import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecentProject } from '../shared/api'
import { parseRecentProjects, projectFolderName, rememberRecent } from '../shared/project'

function recentsPath(): string {
  return join(app.getPath('userData'), 'recent-projects.json')
}

export async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const parsed = parseRecentProjects(JSON.parse(await readFile(recentsPath(), 'utf8')))
    const existing: RecentProject[] = []
    for (const project of parsed) {
      try {
        await access(project.jsonPath)
        existing.push(project)
      } catch {
        continue
      }
    }
    if (existing.length !== parsed.length) await writeRecentProjects(existing)
    return existing
  } catch {
    return []
  }
}

export async function rememberProject(jsonPath: string): Promise<void> {
  const current = await readRecentProjects()
  await writeRecentProjects(
    rememberRecent(current, { name: projectFolderName(jsonPath), jsonPath })
  )
}

async function writeRecentProjects(projects: RecentProject[]): Promise<void> {
  await writeFile(recentsPath(), JSON.stringify(projects, null, 2), 'utf8')
}
