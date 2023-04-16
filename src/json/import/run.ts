import { importFrom } from './functions'
import { rimrafSync } from 'rimraf'
import path from 'node:path'

// execution block
if (process.argv.length < 3) {
  console.error('Please provide a folder path')
}

const dest = './src/json/files'
const filesList = ['metaGroups.yaml', 'typeIDs.yaml', 'marketGroups.yaml']

// remove old db
rimrafSync(dest)

// import new db
importFrom(path.resolve(process.argv[2]), path.resolve(dest), (p) => {
  return filesList.some((f) => p.endsWith(f))
})
