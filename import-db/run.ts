import { capitalize, importFrom } from './functions'
import { quicktype, InputData, jsonInputForTargetLanguage } from 'quicktype-core'
const { rimrafSync } = require('rimraf')
const path = require('node:path')
const fs = require('node:fs')

// execution block
if (process.argv.length < 3) {
  console.error('Please provide a folder path')
}

const dest = './public/json-db'
const typesDest = './src/json-types.ts'
const filesList = ['metaGroups.yaml']

// remove old db
rimrafSync(dest)

// remove old type definitions
rimrafSync(typesDest)

// import new db
importFrom(
  path.resolve(process.argv[2]),
  path.resolve(dest),
  (p) => {
    return filesList.some((f) => p.endsWith(f))
  },
  async (fileName, content) => {
    const jsonInput = jsonInputForTargetLanguage('typescript')
    const name = extractTypeName(fileName)
    await jsonInput.addSource({
      name,
      samples: [content],
    })

    const inputData = new InputData()
    inputData.addInput(jsonInput)

    const types = await quicktype({
      inputData,
      lang: 'typescript',
      rendererOptions: {
        'just-types': 'string',
        'runtime-typecheck': 'string',
      },
    })

    const fileType = `export type ${capitalize(name)}File = Record<string, ${capitalize(name)}>`

    fs.appendFileSync(
      typesDest,
      `// ${name}\n\n` + fileType + '\n\n' + types.lines.join('\n') + '\n\n',
    )
  },
)

function extractTypeName(fileName: string): string {
  const baseName = path.parse(fileName).name
  return camelize(baseName.replace('.yaml', '').replace('.', ''))
}

function camelize(str: string): string {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
    if (+match === 0) return '' // or if (/\s+/.test(match)) for white spaces
    return index === 0 ? match.toLowerCase() : match.toUpperCase()
  })
}
