import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

function getAllFiles(dirPath: string, input: string[] = []) {
  const files: string[] = fs.readdirSync(dirPath)

  let arrayOfFiles = input || []

  files.forEach(function (file) {
    if (fs.statSync(dirPath + path.sep + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + path.sep + file, arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, path.sep, file))
    }
  })

  return arrayOfFiles
}

function printLine(line: string) {
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
  process.stdout.write(line)
}

export function importFrom(dir: string, outputDir: string, filter: (path: string) => boolean) {
  const files = getAllFiles(dir).filter(filter)
  let counter = 0

  for (const file of files) {
    const fileContent = fs.readFileSync(file, 'utf8')
    // const dirName = path.dirname(file).replace(dir, outputDir)
    const baseName = path.parse(file).name
    const dirName = outputDir

    printLine(`${file} (${++counter} of ${files.length})`)
    const parsed = yaml.load(fileContent)

    fs.mkdirSync(dirName, { recursive: true })
    const result = JSON.stringify(parsed)
    const name = dirName + path.sep + baseName + '.json'

    fs.writeFileSync(name, result)
  }
}

export function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1)
}
