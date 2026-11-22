import { useLocale } from '../i18n/LocaleProvider.tsx';
import { useState } from 'react';
import type { Fit } from '../domain/fit.ts';
import { searchLibrary } from '../storage/library.ts';

export function LibraryPanel({ fits, activeId, onOpen, onDelete, onNew }: {
  fits: Fit[]; activeId?: string; onOpen: (fit: Fit) => void; onDelete: (fit: Fit) => void; onNew: () => void;
}) {
  const { m } = useLocale();
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<string>();
  return <section className="panel library" aria-label={m.localLibrary}>
    <header className="panel-heading"><h2>{m.localLibrary}</h2><button onClick={onNew}>{m.newFit}</button></header>
    {fits.length ? <>
      <label className="field">{m.findSavedFits}
        <input type="search" value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <ul className="library-list">
        {searchLibrary(fits, query).map(fit => <li key={fit.id}>
          <button aria-label={m.openFit(fit.name)} aria-current={fit.id === activeId} onClick={() => onOpen(fit)}>
            <span>{fit.name}</span><small>{fit.status === 'draft' ? m.draft : m.saved}</small>
          </button>
          {confirm === fit.id ? <span className="actions">
            <button className="danger" onClick={() => { onDelete(fit); setConfirm(undefined); }}>{m.confirmDelete}</button>
            <button onClick={() => setConfirm(undefined)}>{m.cancel}</button>
          </span> : <button className="subtle" aria-label={m.deleteNamedFit(fit.name)} onClick={() => setConfirm(fit.id)}>{m.deleteFit}</button>}
        </li>)}
      </ul>
    </> : <p className="muted field">{m.savedFitsAppearHere}</p>}
  </section>;
}
