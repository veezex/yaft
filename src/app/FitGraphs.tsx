import { useLocale } from '../i18n/LocaleProvider.tsx';
import { memo, useLayoutEffect, useRef } from 'react';
import type { CalculationResult } from '../fitting/worker-protocol.ts';

type Graph = CalculationResult['graphs'][number];

const samePoints = (a: Graph['points'], b: Graph['points']) => a === b ||
  (a.length === b.length && a.every(({ x, y }, i) => x === b[i].x && y === b[i].y));

const DpsCanvas = memo(function DpsCanvas({ points }: { points: Graph['points'] }) {
  const { m, number } = useLocale();
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const chart = canvas.current;
    const context = chart?.getContext('2d');
    if (!chart || !context || !points.length) return;
    const width = chart.width;
    const height = chart.height;
    const bottom = height - 20;
    const maxY = Math.max(1, ...points.map(point => point.y));
    const maxX = Math.max(1, points.at(-1)!.x);
    context.clearRect(0, 0, width, height);
    context.strokeStyle = '#647279';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(38, 8);
    context.lineTo(38, bottom);
    context.lineTo(width - 8, bottom);
    context.stroke();
    context.fillStyle = '#b6c0bb';
    context.font = '12px system-ui';
    context.fillText(number(maxY, 0), 2, 14, 34);
    context.fillText(m.distanceKm(0), 38, height - 4);
    context.fillText(m.distanceKm(number(maxX / 1000, 1)), width - 67, height - 4);
    context.strokeStyle = '#d2e990';
    context.lineWidth = 2;
    context.beginPath();
    points.forEach(({ x, y }, index) => {
      const screenX = 38 + x / maxX * (width - 46);
      const screenY = bottom - y / maxY * (height - 34);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
    });
    context.stroke();
  }, [m, number, points]);

  return <canvas ref={canvas} width={480} height={190} role="img" aria-label={m.appliedDpsByDistance} />;
}, (a, b) => samePoints(a.points, b.points));

export const FitGraphs = memo(function FitGraphs({ dps }: { dps?: Graph }) {
  const { m, number } = useLocale();
  const points = dps?.points;
  const hasPoints = Boolean(points?.length);
  return <details className="graphs">
    <summary>{m.performanceGraphs}</summary>
    <h4>{m.appliedDpsByDistance}{dps?.status === 'partial' ? m.partialSuffix : ''}</h4>
    <div className="graph-plot">
      {hasPoints && points ? <DpsCanvas points={points} /> :
        <p className="muted">{m.appliedDamageNeedsATarget}</p>}
    </div>
    <details className="chart-values" data-hidden={!hasPoints}>
      <summary>{m.chartValues}</summary>
      <dl className="all-stats">{points?.filter((_, index) => index % 5 === 0).map(point => <div key={point.x}>
        <dt>{m.distanceKm(number(point.x / 1000, 1))}</dt><dd>{m.damageDps(number(point.y, 1))}</dd>
      </div>)}</dl>
    </details>
    <p className="muted">{m.capacitorTimelineUnavailable}</p>
  </details>;
}, (previous, next) => {
  const a = previous.dps;
  const b = next.dps;
  return a === b || Boolean(a && b && a.status === b.status && samePoints(a.points, b.points));
});
