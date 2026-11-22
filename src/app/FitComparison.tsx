import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, localizedName } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { Fit } from '../domain/fit.ts';
import { skillProfileName } from '../domain/skills.ts';
import type { SkillProfile } from '../domain/skills.ts';
import type { FitConditions } from '../domain/conditions.ts';
import type { createFittingWorker } from '../fitting/worker-client.ts';
import type { CalculationResult } from '../fitting/worker-protocol.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import { itemGroupLabels } from './FitEditor.tsx';
import { displayMetric } from './FitStats.tsx';

const keys = ['totalDps', 'appliedDps', 'alphaStrike', 'ehpTotal', 'velocity', 'capacitorStable', 'lockRange'];
type FitInputs = Pick<Fit, 'id' | 'shipTypeId' | 'modeTypeId' | 'items'>;

export function FitComparison({ fit, saved, profile, conditions, worker, known }: {
  fit?: Fit; saved: Fit[]; profile: SkillProfile; conditions?: FitConditions; worker?: ReturnType<typeof createFittingWorker>; known: Record<number, CatalogType>;
}) {
  const { m, locale, text } = useLocale();
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<{ focus: FitInputs; others: Fit[]; profile: SkillProfile; conditions?: FitConditions; results: CalculationResult[] }>();
  const [error, setError] = useState<Text>('');
  const choices = saved.filter(value => value.id !== fit?.id);
  const { id, shipTypeId, modeTypeId, items } = fit ?? {};
  const focus = useMemo(() => id !== undefined && shipTypeId !== undefined && items ? { id, shipTypeId, modeTypeId, items } : undefined,
    [id, shipTypeId, modeTypeId, items]);
  const others = useMemo(() => saved.filter(value => selected.includes(value.id) && value.id !== id), [saved, selected, id]);
  const compared = fit ? [fit, ...others] : [];
  const getOpenFit = useEffectEvent(() => fit);
  useEffect(() => {
    setError('');
    const open = getOpenFit();
    if (!open || !focus || !others.length || !worker) return;
    let current = true;
    Promise.all([open, ...others].map(value => worker.request({ kind: 'calculate', fit: value, fitRevision: value.revision, profile, conditions })))
      .then(values => { if (current) setComparison({ focus, others, profile, conditions, results: values }); })
      .catch(reason => { if (current) setError(errorText(reason)); });
    return () => { current = false; };
  }, [focus, others, conditions, profile, worker]);

  const sameFits = comparison && focus && comparison.focus.id === focus.id && comparison.focus.shipTypeId === focus.shipTypeId &&
    comparison.others.length === others.length && comparison.others.every((input, index) =>
      input.id === others[index].id && input.shipTypeId === others[index].shipTypeId);
  const results = sameFits && comparison.results[0]?.compatibilityId === worker?.compatibilityId ? comparison.results : [];
  const calculating = compared.length > 1 && !error &&
    (comparison?.focus !== focus || comparison?.others !== others || comparison.profile !== profile || comparison.conditions !== conditions ||
      comparison.results[0]?.compatibilityId !== worker?.compatibilityId);
  const equipmentLabels = new Map<string, string>();
  const itemCounts = compared.map(value => {
    const counts = new Map<string, number>();
    for (const row of value.items) {
      const type = row.typeId === undefined ? undefined : known[row.typeId];
      const name = localizedName(locale, type?.names) ?? row.unknownSource ?? `#${row.typeId}`;
      const key = JSON.stringify([row.group, row.typeId ?? row.unknownSource]);
      equipmentLabels.set(key, `${name} · ${m[itemGroupLabels[row.group]]}`);
      counts.set(key, (counts.get(key) ?? 0) + row.quantity);
    }
    return counts;
  });
  const equipment = [...equipmentLabels]
    .filter(([key]) => itemCounts.some(counts => counts.get(key) !== itemCounts[0].get(key)));
  if (!fit || !choices.length) return null;
  return <details className="panel comparison">
    <summary>{m.compareFits}</summary>
    <div className="editor-body">
      <p className="muted">{m.sharedProfile(skillProfileName(profile, m))}{conditions?.target ? m.targetAt(conditions.target.distanceMeters) : ''}</p>
      <fieldset><legend>{m.compareTheOpenFitWith}</legend>
        {choices.map(value => <label key={value.id} className="check"><input type="checkbox" checked={selected.includes(value.id)}
          onChange={event => setSelected(ids => event.target.checked ? [...ids, value.id] : ids.filter(id => id !== value.id))} />
          {value.name}</label>)}
      </fieldset>
      {error && <p role="alert">{text(error)}</p>}
      {results.length > 1 && <div className="table-scroll" aria-busy={calculating}><table>
        <thead><tr><th scope="col">{m.metric}</th>{compared.map(value => <th key={value.id} scope="col">{value.name}</th>)}</tr></thead>
        <tbody>
          {equipment.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>
            {itemCounts.map((counts, index) => <td key={compared[index].id}>{counts.get(key) ?? 0}</td>)}</tr>)}
          {keys.map(key => {
            const metrics = results.map(result => result.metrics.find(value => value.key === key));
            if (!metrics.some(Boolean)) return null;
            return <tr key={key}><th scope="row">{text(metrics.find(Boolean)?.label ?? key)}</th>
              {metrics.map((metric, index) => <td key={compared[index].id}>{metric ? displayMetric(metric, locale) : m.unavailableMetric}</td>)}</tr>;
          })}
        </tbody>
      </table></div>}
    </div>
  </details>;
}
