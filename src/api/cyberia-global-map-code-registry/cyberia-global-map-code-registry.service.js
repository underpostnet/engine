import { DataQuery } from '../../server/storage/data-query.js';
import {
  reconcileMapRegistry,
  registryModels,
  registryTransaction,
  resolveMapOwner,
} from '../../projects/cyberia/instance/map-registry.js';
import { CyberiaGlobalMapCodeRegistryDto } from './cyberia-global-map-code-registry.model.js';

const failure = (status, message) => Object.assign(new Error(message), { status });

class CyberiaGlobalMapCodeRegistryService {
  /** GET /:mapCode — the owner a navigation resolves a map code of the served catalog to. */
  static resolve = async (req, res, options) => {
    const owner = await resolveMapOwner(registryModels(options), req.params.mapCode);
    if (!owner) throw failure(404, `No owner of map ${req.params.mapCode}`);
    return owner;
  };

  /** GET / — the rows of the served catalog, deprecated ones included. */
  static get = async (req, res, options) => {
    const models = registryModels(options);
    const { query, sort, skip, limit, page } = DataQuery.parse(req.query);
    const filter = { $and: [query, { catalog: models.CyberiaMap.db.name }] };
    const Registry = models.CyberiaGlobalMapCodeRegistry;
    const [data, total] = await Promise.all([
      Registry.find(filter)
        .select(CyberiaGlobalMapCodeRegistryDto.select.get())
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Registry.countDocuments(filter),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  };

  /** POST /reconcile — the report of the served catalog; `{apply: true}` repairs it in one transaction. */
  static reconcile = async (req, res, options) => {
    const models = registryModels(options);
    return req.body?.apply === true ? (await registryTransaction(models)).report : await reconcileMapRegistry(models);
  };
}

export { CyberiaGlobalMapCodeRegistryService };
