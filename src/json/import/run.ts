import { importFrom } from './functions'
import { rimrafSync } from 'rimraf'
import path from 'node:path'
import { mMarketGroups } from './mappers/mMarketGroups'
import { mTypeIds } from './mappers/mTypeIds'

// execution block
if (process.argv.length < 3) {
  console.error('Please provide a folder path')
}

const dest = './src/json/files'

// only import these files with the given order
const filesList = [
  'metaGroups.yaml',
  'marketGroups.yaml',
  'typeIDs.yaml',
  'dogmaAttributeCategories.yaml',
]

// remove old db
rimrafSync(dest)

// market group ids
let marketGroups: string[] | null = null

// import new db
importFrom({
  dir: path.resolve(process.argv[2]),
  outputDir: path.resolve(dest),
  filter: files => {
    const filtered = files.filter(p => filesList.some(f => p.endsWith(f)))
    return filtered.sort((a, b) => {
      const aKey = filesList.findIndex(f => a.endsWith(f))
      const bKey = filesList.findIndex(f => b.endsWith(f))
      return aKey - bKey
    })
  },
  modify: (fileName, data) => {
    if (fileName.endsWith('marketGroups.yaml')) {
      const groups = mMarketGroups(data)
      marketGroups = Object.keys(groups)

      return groups
    }
    if (fileName.endsWith('typeIDs.yaml')) {
      if (!marketGroups) {
        throw new Error('Market groups not loaded')
      }

      return mTypeIds(data, marketGroups)
    }
    return data
  },
})
