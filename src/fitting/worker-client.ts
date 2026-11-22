import { LocalizedError, msg } from '../i18n/index.ts';
import type { WorkerRequest, WorkerResponse } from './worker-protocol.ts';

type Request = WorkerRequest extends infer R ? R extends WorkerRequest ? Omit<R, 'requestId' | 'compatibilityId'> : never : never;
type Response<RequestKind> = Extract<WorkerResponse, { kind: RequestKind }>;

export function createFittingWorker(compatibilityId: string) {
  const worker = new Worker(new URL('./fitting.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<string, { resolve: (response: WorkerResponse) => void; reject: (error: Error) => void }>();
  let retired = false;
  const fail = (error: Error) => {
    for (const task of pending.values()) task.reject(error);
    pending.clear();
    if (retired) worker.terminate();
  };
  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const task = pending.get(data.requestId);
    if (!task) return;
    pending.delete(data.requestId);
    if (data.compatibilityId !== compatibilityId) task.reject(new LocalizedError(msg('unexpectedCatalogVersionInWorker')));
    else if (data.kind === 'error') task.reject(new LocalizedError(data.message));
    else task.resolve(data);
    if (retired && !pending.size) worker.terminate();
  };
  worker.onerror = event => fail(new LocalizedError(event.message || msg('fittingWorkerFailed')));
  return {
    compatibilityId,
    request<T extends Request>(request: T) {
      const requestId = crypto.randomUUID();
      return new Promise<WorkerResponse>((resolve, reject) => {
        if (retired) { reject(new LocalizedError(msg('fittingWorkerWasReplaced'))); return; }
        pending.set(requestId, { resolve, reject });
        try {
          worker.postMessage({ ...request, requestId, compatibilityId });
        } catch (error) {
          pending.delete(requestId);
          reject(error);
        }
      }) as Promise<Response<T['kind']>>;
    },
    retire() {
      retired = true;
      if (!pending.size) worker.terminate();
    },
    close() {
      worker.terminate();
      fail(new LocalizedError(msg('fittingWorkerClosed')));
    },
  };
}

export async function checkCompatibleCharges(
  worker: ReturnType<typeof createFittingWorker>, moduleTypeId: number, typeIds: Iterable<number>,
): Promise<Set<number>> {
  const candidates = [...new Set(typeIds)];
  const pages = await Promise.all(Array.from({ length: Math.ceil(candidates.length / 100) }, (_, index) =>
    worker.request({ kind: 'search', query: '', offset: 0, limit: 100, moduleTypeId,
      typeIds: candidates.slice(index * 100, (index + 1) * 100), includeUnpublished: true })));
  return new Set(pages.flatMap(page => page.results.map(type => type.typeId)));
}
