import { isObject } from '../util'

export function mTypeIds(input: unknown, marketGroups: string[]): unknown {
  if (!isObject(input)) {
    throw new Error('Input is not an object')
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!isObject(value)) {
      throw new Error('Value is not an object')
    }

    if (value.published === true) {
      if (typeof value.marketGroupID === 'number') {
        if (marketGroups.includes(value.marketGroupID.toString())) {
          result[key] = value
        }
      }
    }
  }

  return result
}
