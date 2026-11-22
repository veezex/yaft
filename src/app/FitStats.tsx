import { useLocale } from '../i18n/LocaleProvider.tsx';
import { dictionaries, formatNumber, metricUnit } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { memo } from 'react';
import { FitGraphs } from './FitGraphs.tsx';
import type { CalculationResult, Metric } from '../fitting/worker-protocol.ts';

const overview = [
  ['totalDps', 'totalDamage'], ['appliedDps', 'appliedDamage'], ['alphaStrike', 'volleyDamage'],
  ['ehpTotal', 'effectiveHitPoints'], ['velocity', 'maximumVelocity'],
  ['capacitorLevel', 'stableCapacitorLevel'], ['lockRange', 'targetingRange'],
] as const;
const resources = [
  ['cpu', 'cpuUsed', 'cpuMax'], ['powergrid', 'powerUsed', 'powerMax'],
  ['calibration', 'calibrationUsed', 'calibrationMax'],
  ['droneBay', 'droneBayUsed', 'droneBayMax'], ['droneBandwidth', 'droneBandwidthUsed', 'droneBandwidthMax'],
] as const;

export function displayMetric(metric: Metric, locale: Locale) {
  const m = dictionaries[locale];
  if (metric.value === undefined) return metric.status === 'not-applicable' ? '—' : m[metric.status];
  const value = typeof metric.value === 'number' ? formatNumber(locale, metric.value) : metric.value ? m.yes : m.no;
  return `${metric.unit ? m.metricValueWithUnit(value, metricUnit(locale, metric.unit)) : value}${metric.status === 'partial' ? m.partialSuffix : ''}`;
}

export function FitStats({ result, fitting, calculating }: { result?: CalculationResult; fitting: boolean; calculating: boolean }) {
  const { m } = useLocale();
  return <section className="panel stats" aria-label={m.fittingResults} aria-busy={calculating}>
    <header className="panel-heading"><h2>{m.fittingResults}</h2>
      <span className="fit-state calculation-status" aria-live="polite">{calculating ? m.calculating : ''}</span>
    </header>
    <div className="panel-scroll">
      {fitting ? <Results result={result} waiting={!result && calculating} /> :
        <p className="muted">{m.emptyResults}</p>}
    </div>
  </section>;
}

const Results = memo(function Results({ result, waiting }: { result?: CalculationResult; waiting: boolean }) {
  const { m, locale, text } = useLocale();
  const find = (key: string) => result?.metrics.find(metric => metric.key === key);
  return <>
      <div className="resource-list">
        {resources.map(([labelKey, used, max]) => {
          const label = m[labelKey];
          const use = find(used);
          const capacity = find(max);
          const amount = Number(use?.value ?? 0);
          const limit = Number(capacity?.value ?? 0);
          const ratio = m.resourceRatio(use ? displayMetric(use, locale) : '—', capacity ? displayMetric(capacity, locale) : '—');
          return <div key={labelKey} className={amount > limit ? 'resource over' : 'resource'}>
            <div>
              <span>{label}</span>
              <span className="resource-value" title={ratio}>{ratio}</span>
            </div>
            <meter min={0} max={Math.max(1, limit)} value={Math.min(amount, Math.max(1, limit))} aria-label={label} />
          </div>;
        })}
      </div>
      <dl className="stat-grid">{overview.map(([key, labelKey]) => {
        const metric = find(key);
        return <div key={key}><dt>{m[labelKey]}</dt><dd>{metric ? displayMetric(metric, locale) : '—'}</dd></div>;
      })}</dl>
      <FitGraphs dps={result?.graphs.find(graph => graph.key === 'appliedDps')} />
      <details><summary>{m.allMetrics}</summary><dl className="all-stats metric-list">{result?.metrics.map(metric => (
        <div key={metric.key}><dt>{text(metric.label)}</dt><dd>{displayMetric(metric, locale)}</dd></div>
      ))}</dl></details>
      <div className="warnings" role="region" aria-label={m.fitWarnings}
        data-has-warnings={Boolean(result?.warnings.length)} tabIndex={result?.warnings.length ? 0 : undefined}>
        <h3>{m.warnings}</h3>
        {result?.warnings.length ? <ul>{result.warnings.map((warning, index) => <li key={index}>{text(warning.message)}</li>)}</ul> :
          <p className="muted">{waiting ? m.checkingFit : result ? m.noWarnings : m.warningsUnavailable}</p>}
      </div>
  </>;
});
