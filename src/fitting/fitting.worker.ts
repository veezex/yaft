import { errorText, LocalizedError, msg } from '../i18n/index.ts';
import { installedRelease, readCatalogArtifact } from '../storage/catalog-store.ts';
import { calculateFit, EngineCatalog } from './engine-adapter.ts';
import { isRecord } from '../storage/catalog-contract.ts';
import { parseWorkerRequest } from './worker-protocol.ts';
import type { WorkerResponse } from './worker-protocol.ts';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const catalogs = new Map<string, Promise<{ catalog: EngineCatalog; engineRulesVersion: string }>>();

function openRelease(id: string) {
  let opening = catalogs.get(id);
  if (!opening) {
    opening = (async () => {
      const manifest = await installedRelease(id);
      if (!manifest) throw new LocalizedError(msg('thePinnedCatalogIsUnavailable'));
      const [index, dogma] = await Promise.all([readCatalogArtifact(manifest, 'index'), readCatalogArtifact(manifest, 'dogma')]);
      return { catalog: new EngineCatalog(index, dogma, segment => readCatalogArtifact(manifest, 'types', segment)),
        engineRulesVersion: manifest.engineRulesVersion };
    })();
    catalogs.set(id, opening);
    opening.catch(() => catalogs.delete(id));
  }
  return opening;
}

scope.onmessage = async ({ data }: MessageEvent<unknown>) => {
  let response: WorkerResponse;
  try {
    const request = parseWorkerRequest(data);
    const { kind, requestId, compatibilityId } = request;
    const { catalog, engineRulesVersion } = await openRelease(compatibilityId);
    switch (kind) {
      case 'initialize': response = { kind, requestId, compatibilityId, engineRulesVersion }; break;
      case 'search': {
        const page = await catalog.search(request);
        response = { kind, requestId, compatibilityId, ...page,
          attributes: request.includeAttributes ? await catalog.describe(page.results) : undefined };
        break;
      }
      case 'validate-equipment':
        response = { kind, requestId, compatibilityId, warning: await catalog.equipmentWarning(request.hullTypeId, request.typeId) };
        break;
      case 'calculate': response = { kind, ...await calculateFit(catalog, request) }; break;
    }
  } catch (error) {
    response = { kind: 'error',
      requestId: isRecord(data) ? String(data.requestId) : '',
      compatibilityId: isRecord(data) ? String(data.compatibilityId) : '',
      message: errorText(error),
    };
  }
  scope.postMessage(response);
};
