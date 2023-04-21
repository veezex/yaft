import { isObject } from '../util'

// todo: use io-ts
function categoriesToKeep(input: Record<string, unknown>, rootCategories: string[]): string[] {
  if (!rootCategories.length) {
    return []
  }

  const cats: string[] = []

  for (const [key, value] of Object.entries(input)) {
    if (!isObject(value)) {
      throw new Error('Value is not an object')
    }

    if (
      typeof value.parentGroupID === 'number' &&
      rootCategories.includes(value.parentGroupID.toString())
    ) {
      cats.push(key)
    }
  }

  return [...rootCategories, ...categoriesToKeep(input, cats)]
}

export function mMarketGroups(input: unknown): unknown {
  /*
    4,  # Ship
    9,  # Ship Equipment
    1111,  # Rigs
    157,  # Drones
    11,  # Ammunition & Charges
    1112,  # Subsystems
    24,  # Implants & Boosters
  */
  const rootCategories = ['4', '9', '1111', '157', '11', '1112', '24']

  if (!isObject(input)) {
    throw new Error('Input is not an object')
  }

  const cats = categoriesToKeep(input, rootCategories)
  console.log(cats)

  // recusively keep only categories that are in rootCategories
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (cats.includes(key)) {
      if (!isObject(value)) {
        throw new Error('Value is not an object')
      }

      value.parentGroupID = '0'
      output[key] = value
    }
  }

  return output
}
