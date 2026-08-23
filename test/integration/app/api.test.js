'use strict';

import axios from 'axios';
import express from 'express';

import { expect } from 'chai';
import { TestRouter } from '../../../src/api/test/test.router.js';
import { loggerFactory } from '../../../src/server/ops/logger.js';

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

describe(`GET 'Test' API Request `, async () => {
  const app = express();
  app.use('/api/test', TestRouter.router({ authMiddleware: (_req, _res, next) => next() }));

  let server;
  let baseUrl;

  beforeAll(
    () =>
      new Promise((resolve, reject) => {
        server = app.listen(0, '127.0.0.1', () => {
          baseUrl = `http://127.0.0.1:${server.address().port}/api`;
          resolve();
        });
        server.on('error', reject);
      }),
  );

  afterAll(
    () =>
      new Promise((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      ),
  );

  {
    const youtubeId = '2aib-pmgUdQ';
    it(`youtube id from raw youtube url`, async () => {
      const url = `${baseUrl}/test/youtube-id/?url=https://www.youtube.com/watch?v=${youtubeId}`;
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data).equal(youtubeId);
    });
  }
  {
    const email = 'test@gmail.com';
    it(`valid format email`, async () => {
      const url = `${baseUrl}/test/verify-email/?email=${email}`;
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data).equal(true);
    });
  }
  {
    const password = 'Password123!';
    it(`valid password`, async () => {
      const url = `${baseUrl}/test/is-strong-password/?password=${password}`;
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data.length).equal(0);
    });
  }
});
