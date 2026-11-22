import { useLocale } from '../i18n/LocaleProvider.tsx';
import { damageTypes } from '../domain/conditions.ts';
import type { FitConditions } from '../domain/conditions.ts';

export const newConditions = (): FitConditions => ({
  id: crypto.randomUUID(), damage: { em: 1, thermal: 1, kinetic: 1, explosive: 1 }, implants: [], boosters: [], sources: [],
});
const defaultTarget: NonNullable<FitConditions['target']> = {
  signatureMeters: 40, velocityMetersPerSecond: 0, distanceMeters: 5000,
  resistances: { em: 0, thermal: 0, kinetic: 0, explosive: 0 },
};

export function ConditionsPanel({ conditions, onChange }: { conditions: FitConditions; onChange: (conditions: FitConditions) => void }) {
  const { m } = useLocale();
  const { target } = conditions;
  return <details className="conditions">
    <summary>{m.simulationConditions}</summary>
    <fieldset>
      <legend>{m.incomingDamageWeights}</legend>
      <div className="condition-grid">
        {damageTypes.map(type => <label key={type} className="field">{m.damageType(type)}
          <input type="number" min={0} step="any" value={conditions.damage[type]} onChange={event => {
            if (Number.isFinite(event.target.valueAsNumber)) onChange({
              ...conditions, damage: { ...conditions.damage, [type]: event.target.valueAsNumber },
            });
          }} />
        </label>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>{m.target}</legend>
      <label className="check"><input type="checkbox" checked={Boolean(target)} onChange={event => {
        onChange({ ...conditions, target: event.target.checked ? structuredClone(defaultTarget) : undefined });
      }} /> {m.simulateATarget}</label>
      {target && <div className="condition-grid">
        {([
          [m.targetDistanceM, 'distanceMeters', 0],
          [m.targetSignatureM, 'signatureMeters', 0.01],
          [m.targetVelocityMS, 'velocityMetersPerSecond', 0],
        ] as const).map(([title, key, min]) => <label key={key} className="field">{title}
          <input type="number" min={min} step="any" value={target[key]} onChange={event => {
            if (Number.isFinite(event.target.valueAsNumber)) onChange({ ...conditions, target: { ...target, [key]: event.target.valueAsNumber } });
          }} />
        </label>)}
        {damageTypes.map(type => <label key={type} className="field">{m.resistancePercent(type.toUpperCase())}
          <input type="number" min={0} max={100} step="any" value={target.resistances[type] * 100}
            onChange={event => {
              if (Number.isFinite(event.target.valueAsNumber)) onChange({
                ...conditions, target: { ...target, resistances: { ...target.resistances, [type]: event.target.valueAsNumber / 100 } },
              });
            }} />
        </label>)}
      </div>}
    </fieldset>
    <label className="field">{m.environmentEffectTypeId}
      <input type="number" min={1} value={conditions.environmentTypeId ?? ''} onChange={event => {
        const id = event.target.valueAsNumber;
        onChange({ ...conditions, environmentTypeId: Number.isSafeInteger(id) && id > 0 ? id : undefined });
      }} />
    </label>
  </details>;
}
