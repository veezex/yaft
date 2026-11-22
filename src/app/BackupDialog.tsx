import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useState } from 'react';
import type { Fit } from '../domain/fit.ts';
import { decodeBackup, encodeBackup } from '../formats/backup.ts';
import { applyRestore, prepareRestore } from '../storage/restore.ts';
import { readLibrary } from '../storage/library.ts';

export function downloadFile(text: string, name: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadOpenFit(fit: Fit): Promise<void> {
  const data = await readLibrary().catch(() => undefined);
  if (!data) {
    downloadFile(JSON.stringify(fit, null, 2), 'yaft-open-fit.json');
    return;
  }
  try {
    downloadFile(encodeBackup({ ...data, fits: [fit], settings: { formatVersion: 1 } }), 'yaft-open-fit.json');
  } catch (error) {
    downloadFile(JSON.stringify(fit, null, 2), 'yaft-open-fit.json');
    throw error;
  }
}

export function BackupDialog({ onRestore }: { onRestore: () => void }) {
  const { m, text } = useLocale();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof prepareRestore>>>();
  const [replace, setReplace] = useState(false);
  const [status, setStatus] = useState<Text>('');
  const [error, setError] = useState<Text>('');
  async function view(file: File) {
    setPreview(undefined);
    setReplace(false);
    setStatus('');
    setError('');
    try {
      setPreview(await prepareRestore(decodeBackup(await file.text())));
    } catch (reason) {
      setError(errorText(reason));
    }
  }
  return <div className="backup">
    <div className="actions">
      <button onClick={() => readLibrary().then(data => downloadFile(encodeBackup(data), 'yaft-library.json'))
        .catch(reason => setError(errorText(reason)))}>{m.downloadBackup}</button>
      <label className="file-button">{m.restoreBackup}
        <input type="file" accept=".json,application/json" onChange={event => {
          const file = event.target.files?.[0];
          if (file) void view(file);
          event.target.value = '';
        }} />
      </label>
    </div>
    {error && <p role="alert">{text(error)}</p>}
    {status && <p role="status">{text(status)}</p>}
    {preview && <div className="restore-preview">
      <h3>{m.restorePreview}</h3>
      <p>{m.restoreCounts(preview.backup.fits.length, preview.backup.profiles.length, preview.backup.conditions.length)}</p>
      {preview.conflicts.length > 0 && <>
        <ul>{preview.conflicts.map(conflict => <li key={`${conflict.store}:${conflict.id}`}>{conflict.name}</li>)}</ul>
        <label className="check"><input type="checkbox" checked={replace} onChange={event => setReplace(event.target.checked)} /> {m.replaceConflictingRecords}</label>
      </>}
      <div className="actions">
        <button className="primary" disabled={preview.conflicts.length > 0 && !replace}
          onClick={() => applyRestore(preview, replace).then(() => {
            setPreview(undefined); setError(''); setStatus(msg('libraryRestored')); onRestore();
          }).catch(reason => setError(errorText(reason)))}>{m.restoreLibrary}</button>
        <button onClick={() => setPreview(undefined)}>{m.cancel}</button>
      </div>
    </div>}
  </div>;
}
