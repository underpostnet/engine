'use strict';

import { expect } from 'chai';
import {
  buildCrudController,
  serviceHandler,
  setCrossOriginHeaders,
} from '../../../../src/server/network/middlewares.js';

// Minimal Express doubles: the middleware only sets headers and sends one JSON envelope.
const requestFrom = (origin) => ({ query: {}, params: {}, path: '/', headers: origin ? { origin } : {} });
const responseSpy = () => {
  const headers = {};
  const response = {
    headers,
    body: undefined,
    statusCode: 0,
    set: (key, value) => (headers[key] = value),
    setHeader: (key, value) => (headers[key] = value),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return response;
};

const crudService = {
  get: async () => ({ data: [], total: 0 }),
  post: async () => ({}),
  put: async () => ({}),
  delete: async () => ({}),
};

describe('public API cross-origin policy', () => {
  it('answers a browser read with the origin it came from', async () => {
    // The browser client is served from its own origin: a read without this header arrives with
    // status 200 and is then discarded by the same-origin policy, which looks like a broken
    // feature rather than a failed request.
    const response = responseSpy();
    await buildCrudController(crudService).get(requestFrom('http://localhost:8082'), response, {});
    expect(response.headers['Access-Control-Allow-Origin']).to.equal('http://localhost:8082');
    expect(response.headers['Cross-Origin-Resource-Policy']).to.equal('cross-origin');
    expect(response.statusCode).to.equal(200);
    expect(response.body.status).to.equal('success');
  });

  it('falls back to any origin when the request declares none', async () => {
    const response = responseSpy();
    await buildCrudController(crudService).get(requestFrom(), response, {});
    expect(response.headers['Access-Control-Allow-Origin']).to.equal('*');
  });

  it('keeps writes same-origin: only reads are public', async () => {
    const response = responseSpy();
    await buildCrudController(crudService).post(requestFrom('http://localhost:8082'), response, {});
    expect(response.headers).to.not.have.property('Access-Control-Allow-Origin');
  });

  it('carries the same policy on a hand-written read handler', async () => {
    // `setCrossOriginHeaders` is the one place the policy lives, so a custom route opts in with it
    // rather than restating the headers.
    const response = responseSpy();
    await serviceHandler(async () => ({ ok: true }), { crossOrigin: true })(
      requestFrom('https://www.cyberiaonline.com'),
      response,
      {},
    );
    expect(response.headers['Access-Control-Allow-Origin']).to.equal('https://www.cyberiaonline.com');

    const direct = responseSpy();
    setCrossOriginHeaders(requestFrom('https://www.cyberiaonline.com'), direct);
    expect(direct.headers).to.deep.equal(response.headers);
  });
});
