'use strict';

/**
 * @module downloader-integrity.test
 * @description Covers the contract a split-artifact transfer depends on: a download either
 * produces the whole file or produces none. A response that ends early still ends, so the write
 * stream finishes and, without a length check, a short file is reported as a completed download
 * and only surfaces later as a corrupt archive assembled from it.
 *
 * Uses 'chai' for assertions.
 */

import { expect } from 'chai';
import fs from 'fs-extra';
import http from 'http';
import Downloader from '../../src/server/storage/downloader.js';

const BODY = Buffer.from('a'.repeat(64 * 1024));

/** Serves one response shape and resolves the base URL it listens on. */
const serverFactory = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/part` }));
  });

describe('download integrity', () => {
  let fixturePath;
  let running;

  beforeEach(() => {
    fixturePath = fs.mkdtempSync('/tmp/engine-downloader-');
    running = [];
  });

  afterEach(async () => {
    for (const server of running) await new Promise((resolve) => server.close(resolve));
    fs.removeSync(fixturePath);
  });

  const serve = async (handler) => {
    const { server, url } = await serverFactory(handler);
    running.push(server);
    return url;
  };

  it('saves a complete response and reports the path', async () => {
    const url = await serve((request, response) => {
      response.writeHead(200, { 'content-length': String(BODY.length) });
      response.end(BODY);
    });
    const target = `${fixturePath}/whole.bin`;

    expect(await Downloader.downloadFile(url, target)).to.equal(target);
    expect(fs.statSync(target).size).to.equal(BODY.length);
  });

  it('rejects a response that stops short of its declared length, and leaves no partial file', async () => {
    const url = await serve((request, response) => {
      response.writeHead(200, { 'content-length': String(BODY.length) });
      response.write(BODY.subarray(0, 1024));
      // Ending early is what a cut-short transfer looks like to the client: the stream still ends.
      response.destroy();
    });
    const target = `${fixturePath}/short.bin`;

    let thrown;
    await Downloader.downloadFile(url, target).catch((error) => (thrown = error));

    expect(thrown, 'a truncated transfer must not resolve').to.not.equal(undefined);
    expect(fs.existsSync(target), 'a partial file is indistinguishable from a whole one').to.equal(false);
  });

  it('accepts a response that declares no length, since nothing can be checked against', async () => {
    const url = await serve((request, response) => {
      response.writeHead(200, { 'transfer-encoding': 'chunked' });
      response.end(BODY);
    });
    const target = `${fixturePath}/chunked.bin`;

    expect(await Downloader.downloadFile(url, target)).to.equal(target);
    expect(fs.statSync(target).size).to.equal(BODY.length);
  });

  it('rejects a request the server refuses, and leaves no file', async () => {
    const url = await serve((request, response) => {
      response.writeHead(404);
      response.end();
    });
    const target = `${fixturePath}/missing.bin`;

    let thrown;
    await Downloader.downloadFile(url, target).catch((error) => (thrown = error));

    expect(thrown).to.not.equal(undefined);
    expect(fs.existsSync(target)).to.equal(false);
  });
});
