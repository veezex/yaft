import { LEGACY_HANDLED_EFFECT_IDS, OPERATION_BY_SDE_CODE, OUT_OF_SCOPE_EFFECT_IDS, WEAPON_EFFECT_KIND, REPAIR_EFFECT_AMOUNT_ATTR } from 'eve-fit-engine';
import type { SdeEffect } from 'eve-fit-engine';

const supportedDomains = new Set(['itemID', 'charID', 'shipID', 'target', 'targetID', 'otherID', 'structureID', 'self', 'char']);
const supportedFunctions = new Set(['ItemModifier', 'LocationModifier', 'LocationGroupModifier',
  'LocationRequiredSkillModifier', 'OwnerRequiredSkillModifier', 'EffectStopper']);
const structuralEffects = new Set([11, 12, 13, 16, 42, 2663, 3772, 6306]);
const supportEffects = new Set([18, 592, 6184, 6185, 6186, 6188]);
const outOfScope = new Set(OUT_OF_SCOPE_EFFECT_IDS.map(effect => effect.id));

export const ruleSources = [
  { scope: 'Declarative Dogma and legacy effect registry', source: 'eve-fit-engine@0.2.28' },
  { scope: 'Mining critical yield and ordinary remote support', source: 'Pyfa v2.70.0 eos', coverage: 'Venture and Bantam baseline cases' },
];

export function auditEffects(effects: Array<Pick<SdeEffect, 'id' | 'name' | 'modifierInfo'> & Partial<SdeEffect>>): string[] {
  const diagnostics: string[] = [];
  for (const effect of effects) {
    const { id, name, modifierInfo } = effect;
    const label = `${id} ${name}`;
    if (!modifierInfo.length && (effect.isAssistance || effect.isOffensive) &&
        !LEGACY_HANDLED_EFFECT_IDS.has(id) && !structuralEffects.has(id) && !outOfScope.has(id) &&
        !supportEffects.has(id) && !Object.hasOwn(WEAPON_EFFECT_KIND, id) && !Object.hasOwn(REPAIR_EFFECT_AMOUNT_ATTR, id)) {
      diagnostics.push(`${label}: no implementation for offensive or assistance effect`);
    }
    for (const modifier of modifierInfo) {
      if (!supportedDomains.has(modifier.domain)) diagnostics.push(`${label}: unsupported domain ${modifier.domain}`);
      if (!supportedFunctions.has(modifier.func)) diagnostics.push(`${label}: unsupported modifier ${modifier.func}`);
      if (modifier.operation !== undefined && !Object.hasOwn(OPERATION_BY_SDE_CODE, modifier.operation)) {
        diagnostics.push(`${label}: unsupported operation ${modifier.operation}`);
      }
    }
  }
  return [...new Set(diagnostics)];
}
