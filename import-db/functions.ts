const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

function getAllFiles(dirPath, input: string[] = []) {
  const files = fs.readdirSync(dirPath)

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

function printLine(line) {
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)
  process.stdout.write(line)
}

export function importFrom(
  dir: string,
  outputDir: string,
  filter: (path: string) => boolean,
  handle: (name: string, content: string) => Promise<void>,
) {
  const files = getAllFiles(dir).filter(filter)
  let counter = 0

  for (const file of files) {
    if (/DS_Store/.test(file)) {
      continue // skip DS_Store (macOS)
    }

    const fileContent = fs.readFileSync(file, 'utf8')
    const dirName = path.dirname(file).replace(dir, outputDir)
    const baseName = path.parse(file).name

    printLine(`${file} (${++counter} of ${files.length})`)
    const parsed = yaml.load(fileContent)

    fs.mkdirSync(dirName, { recursive: true }) 
    const result = JSON.stringify(parsed)
    const name = dirName + path.sep + baseName + '.json'

    fs.writeFileSync(name, result)

    handle(name, result)
  }
}
