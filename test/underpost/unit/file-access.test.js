'use strict';

import { expect } from 'chai';
import { Types } from 'mongoose';
import { DataBaseProviderService } from '../../../src/db/DataBaseProvider.js';
import { FileService } from '../../../src/api/file/file.service.js';
import { FileRouter } from '../../../src/api/file/file.router.js';

// Models are in-memory stand-ins: the suite reads the queries the service sends, never a database.
const ID = new Types.ObjectId().toString();
const FILE = { _id: ID, name: 'a.png', mimetype: 'image/png', size: 1, data: Buffer.from([1]) };

describe('file API id guard', () => {
  let queries;
  let getModel;

  beforeEach(() => {
    queries = [];
    const models = {
      File: {
        find: (filter) => {
          queries.push(['find', filter]);
          return { select: async () => [FILE] };
        },
        findOne: async (filter) => {
          queries.push(['findOne', filter]);
          return FILE;
        },
        findByIdAndDelete: async (id) => {
          queries.push(['findByIdAndDelete', id]);
          return FILE;
        },
      },
      Document: { findOne: async () => null },
      User: { findOne: () => ({ lean: async () => null }) },
    };
    getModel = DataBaseProviderService.getModel;
    DataBaseProviderService.getModel = (name) => models[name];
  });

  afterEach(() => {
    DataBaseProviderService.getModel = getModel;
  });

  const request = (id, path = id === undefined ? '/' : `/${id}`) => ({ params: { id }, path, headers: {} });

  it('refuses a missing or malformed id before any query', async () => {
    for (const id of [undefined, '', 'not-an-id', '{"$ne":null}']) {
      for (const [operation, req] of [
        [FileService.get, request(id)],
        [FileService.get, request(id, `/blob/${id}`)],
        [FileService.delete, request(id)],
      ]) {
        let error;
        await operation(req, {}, {}).catch((caught) => (error = caught));
        expect(error?.message, `${req.path}`).to.equal('Invalid file id');
      }
    }
    expect(queries).to.deep.equal([]);
  });

  it('still reads and deletes one file by its id', async () => {
    expect((await FileService.get(request(ID), {}, {})).map(({ _id }) => _id)).to.deep.equal([ID]);
    expect((await FileService.delete(request(ID), {}, {}))._id).to.equal(ID);
    expect(queries).to.deep.equal([
      ['find', { _id: ID }],
      ['findByIdAndDelete', ID],
    ]);
  });

  it('serves no route without an id', () => {
    const routes = FileRouter.router({ authMiddleware: (req, res, next) => next() })
      .stack.filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
    expect(routes).to.not.include('get /');
    expect(routes).to.not.include('delete /');
    expect(routes).to.include.members(['get /:id', 'delete /:id', 'get /blob/:id', 'get /all']);
  });
});
