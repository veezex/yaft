import { useLocale } from '../i18n/LocaleProvider.tsx';
import type { FrozenRelease } from '../storage/catalog-contract.ts';

export function CatalogVersion({ catalog, updateText, busy, onUpdate }: {
  catalog?: FrozenRelease; updateText: string; busy: boolean; onUpdate: () => void;
}) {
  const { m } = useLocale();
  return <details className="catalog-version">
    <summary>{m.catalogVersion}</summary>
    {catalog && <dl>
      <div><dt>{m.ccpRelease}</dt><dd>{catalog.sdeReleaseId}</dd></div>
      <div><dt>{m.tranquilityBuild}</dt><dd>{catalog.sdeBuildNumber}</dd></div>
      <div><dt>{m.rules}</dt><dd>{catalog.engineRulesVersion}</dd></div>
      <div><dt>{m.pyfa}</dt><dd title={catalog.pyfa.commit}>{catalog.pyfa.tag} · {catalog.pyfa.commit.slice(0, 12)}</dd></div>
    </dl>}
    <button type="button" onClick={onUpdate} disabled={busy || !catalog}>{m.checkCatalogUpdate}</button>
    {updateText && <p>{updateText}</p>}
  </details>;
}
