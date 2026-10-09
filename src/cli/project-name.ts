import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

const XML_COMMENT = /<!--[\s\S]*?-->/g
const PARENT_BLOCK = /<parent>[\s\S]*?<\/parent>/
const ARTIFACT_ID = /<artifactId>\s*([\w.-]+)\s*<\/artifactId>/

/**
 * Names a project folder after the `artifactId` of its `pom.xml`, or after the folder itself.
 *
 * @param directory - Absolute project folder.
 * @returns The project name.
 */
export async function readProjectName(directory: string): Promise<string> {
  const pom = await readFile(join(directory, 'pom.xml'), 'utf8').catch(() => '')
  const withoutParent = pom.replace(XML_COMMENT, '').replace(PARENT_BLOCK, '')
  return ARTIFACT_ID.exec(withoutParent)?.[1] ?? basename(directory)
}
