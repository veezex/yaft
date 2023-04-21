import { importFrom } from './functions'
import { rimrafSync } from 'rimraf'
import path from 'node:path'
import { mMarketGroups } from './mappers/mMarketGroups'

// execution block
if (process.argv.length < 3) {
  console.error('Please provide a folder path')
}

const dest = './src/json/files'
const filesList = ['metaGroups.yaml', 'typeIDs.yaml', 'marketGroups.yaml']

// remove old db
rimrafSync(dest)

// import new db
importFrom({
  dir: path.resolve(process.argv[2]),
  outputDir: path.resolve(dest),
  filter: (p) => filesList.some((f) => p.endsWith(f)),
  modify: (fileName, data) => {
    if (fileName.endsWith('marketGroups.yaml')) {
      return mMarketGroups(data)
    }
    return data
  },
})
