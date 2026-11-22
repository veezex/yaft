import { LocalizedError, msg } from '../i18n/index.ts';
import { en } from '../i18n/en.ts';
import type { Dictionary } from '../i18n/index.ts';
import { isTypeId } from './fit.ts';

export type SkillLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface SkillProfile {
  id: string;
  name: string;
  source: 'all-zero' | 'all-v' | 'custom' | 'eve';
  levels: Record<number, SkillLevel>;
  trainedLevels?: Record<number, SkillLevel>;
  characterId?: number;
  fetchedAt?: string;
}

export const presetSkills = {
  'all-zero': { id: 'all-zero', name: en.allSkills0, source: 'all-zero', levels: {} },
  'all-v': { id: 'all-v', name: en.allSkillsV, source: 'all-v', levels: {} },
} satisfies Record<string, SkillProfile>;

export function skillProfileName(profile: SkillProfile, messages: Dictionary): string {
  if (profile.source === 'all-v') return messages.allSkillsV;
  if (profile.source === 'all-zero') return messages.allSkills0;
  return profile.name;
}

export function isSkillLevel(value: unknown): value is SkillLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;
}

export function validateSkillLevels(levels: Record<number, SkillLevel>): void {
  for (const [id, level] of Object.entries(levels)) {
    if (!isTypeId(Number(id)) || !isSkillLevel(level)) throw new LocalizedError(msg('invalidSkillLevelFor', id));
  }
}

export function skillLevel(profile: SkillProfile, typeId: number): SkillLevel {
  if (profile.source === 'all-v') return 5;
  if (profile.source === 'all-zero') return 0;
  return profile.levels[typeId] ?? 0;
}

export function copySkillProfile(profile: SkillProfile, name: string, knownSkillIds: Iterable<number>): SkillProfile {
  const levels = profile.source === 'all-v'
    ? Object.fromEntries(Array.from(knownSkillIds, id => [id, 5 as const]))
    : { ...profile.levels };
  return { id: crypto.randomUUID(), name, source: 'custom', levels };
}
