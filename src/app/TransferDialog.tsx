import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, LocalizedError, msg } from '../i18n/index.ts';
import type { Locale, Text } from '../i18n/index.ts';
import { useState } from 'react';
import type { Fit } from '../domain/fit.ts';
import type { createFittingWorker } from '../fitting/worker-client.ts';
import { checkCompatibleCharges } from '../fitting/worker-client.ts';
import type { WorkerResponse } from '../fitting/worker-protocol.ts';
import { exportDna, parseDna } from '../formats/dna.ts';
import { exportEft, parseEft } from '../formats/eft.ts';
import { exportXml, parseXml } from '../formats/xml.ts';
import { buildLookup, resolveTransfer } from '../formats/transfer.ts';
import type { TransferInput, TransferLookup, TransferOutput, TransferPreview } from '../formats/transfer.ts';
import { importFits } from '../storage/library.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import { downloadFile } from './BackupDialog.tsx';

const codecs = { eft: [parseEft, exportEft], xml: [parseXml, exportXml], dna: [parseDna, exportDna] } as const;
type Format = keyof typeof codecs;
type Worker = ReturnType<typeof createFittingWorker>;

async function lookup(worker: Worker, values: (number | string | undefined)[]) {
  const ids = [...new Set(values.filter((value): value is number => typeof value === 'number'))];
  const names = [...new Set(values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())))];
  const types: CatalogType[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    const result: Extract<WorkerResponse, { kind: 'search' }> = await worker.request({
      kind: 'search', query: '', offset, limit: 100, typeIds: ids, exactNames: names, includeUnpublished: true,
    });
    types.push(...result.results);
    offset = result.nextOffset;
  }
  return buildLookup(types);
}

async function previewImport(worker: Worker, inputs: TransferInput[], catalog: TransferLookup, locale: Locale) {
  const chargesByModule = new Map<number, Set<number>>();
  for (const input of inputs) {
    for (const row of input.rows) {
      if (row.charge === undefined) continue;
      const module = catalog.get(row.type);
      const charge = catalog.get(row.charge);
      if (!module || charge?.categoryId !== 8) continue;
      const charges = chargesByModule.get(module.typeId) ?? new Set<number>();
      charges.add(charge.typeId);
      chargesByModule.set(module.typeId, charges);
    }
  }
  const compatible = new Map(await Promise.all([...chargesByModule].map(async ([id, charges]) =>
    [id, await checkCompatibleCharges(worker, id, charges)] as const)));
  return resolveTransfer(inputs, catalog, (moduleId, chargeId) => compatible.get(moduleId)?.has(chargeId) === true, locale);
}

export function TransferDialog({ worker, fit, onImport }: {
  worker?: Worker; fit?: Fit; onImport: (fit: Fit) => void;
}) {
  const { m, locale, text: renderText } = useLocale();
  const [format, setFormat] = useState<Format>('eft');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<TransferPreview>();
  const [output, setOutput] = useState<TransferOutput>();
  const [error, setError] = useState<Text>('');
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try { await action(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  if (!worker) return null;
  const activeWorker = worker;
  return <section className="panel transfer" aria-label={m.fitExchange}>
    <header className="panel-heading"><h2>{m.fitExchange}</h2></header>
    <div className="editor-body">
      <label className="field">{m.transferFormat}
        <select value={format} disabled={busy} onChange={event => {
          setFormat(event.target.value as Format); setPreview(undefined); setOutput(undefined); setError('');
        }}>
          <option value="eft">{m.eft}</option><option value="xml">{m.eveXml}</option><option value="dna">{m.dnaFittingLink}</option>
        </select>
      </label>
      <label className="field">{m.fitText}
        <textarea rows={4} value={text} disabled={busy} placeholder={format === 'eft' ? m.rifterFitName : undefined}
          onChange={event => { setText(event.target.value); setPreview(undefined); }} />
      </label>
      <div className="actions">
        <label className="file-button">{m.openFittingFile}
          <input type="file" disabled={busy} accept=".txt,.eft,.xml,.dna" onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void run(async () => {
              if (file.size > 2_000_000) throw new LocalizedError(msg('fittingFileExceeds2Mb'));
              const incoming = await file.text();
              setText(incoming);
              setFormat(file.name.endsWith('.xml') ? 'xml' : incoming.trim().startsWith('[') ? 'eft' : 'dna');
              setPreview(undefined);
            });
          }} />
        </label>
        <button disabled={busy || !text.trim()} onClick={() => void run(async () => {
          if (text.length > 2_000_000) throw new LocalizedError(msg('fittingTextIsTooLarge'));
          const inputs = codecs[format][0](text);
          const catalog = await lookup(activeWorker, inputs.flatMap(input => [input.hull, ...input.rows.flatMap(row => [row.type, row.charge])]));
          setPreview(await previewImport(activeWorker, inputs, catalog, locale));
        })}>{m.previewImport}</button>
        <button disabled={busy || !fit} onClick={() => fit && void run(async () => {
          const catalog = await lookup(activeWorker, [fit.shipTypeId, ...fit.items.flatMap(row => [row.typeId, row.charge?.typeId])]);
          setOutput(codecs[format][1](fit, catalog));
        })}>{m.previewExport}</button>
      </div>
      {error && <p role="alert">{renderText(error)}</p>}
      {preview && <div className="restore-preview">
        <h3>{m.importPreview}</h3>
        {preview.fits.map(candidate => <p key={candidate.id}>{m.importCandidateSummary(candidate.name, candidate.items.length)}</p>)}
        {preview.issues.length > 0 && <ul className="transfer-losses" aria-label={m.importWarnings}>
          {preview.issues.map((issue, index) => <li key={index}>{issue.source} · {renderText(issue.message)}</li>)}
        </ul>}
        <div className="actions">
          <button className="primary" disabled={busy || !preview.fits.length} onClick={() => void run(async () => {
            const [stored] = await importFits(preview.fits);
            if (stored) onImport(stored);
            setPreview(undefined);
          })}>{preview.issues.length ? m.importKnownEntries : m.importFits}</button>
          <button disabled={busy} onClick={() => setPreview(undefined)}>{m.cancelImport}</button>
        </div>
      </div>}
      {output && <div className="restore-preview">
        <h3>{m.exportPreview}</h3>
        {output.losses.length > 0 && <ul className="transfer-losses" aria-label={m.exportLosses}>
          {output.losses.map(loss => <li key={loss}>{m[loss]}</li>)}
        </ul>}
        <textarea rows={5} aria-label={m.exportedFit} readOnly value={output.text} />
        <div className="actions">
          <button onClick={() => void run(async () => { await navigator.clipboard.writeText(output.text); })}>{m.copyText}</button>
          <button onClick={() => downloadFile(output.text, `yaft-fit.${format === 'xml' ? 'xml' : 'txt'}`,
            format === 'xml' ? 'application/xml' : 'text/plain')}>{m.downloadExport}</button>
          <button onClick={() => setOutput(undefined)}>{m.closePreview}</button>
        </div>
      </div>}
    </div>
  </section>;
}
