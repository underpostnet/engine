'use strict';

import axios from 'axios';
import dotenv from 'dotenv';
import https from 'https';

import { expect } from 'chai';
import { loggerFactory } from '../src/server/logger.js';

dotenv.config();

const PORT = parseInt(process.env.PORT) + 1;

const logger = loggerFactory(import.meta);

await logger.setUpInfo();

const BASE_URL =
  process.env.NODE_ENV === 'development'
    ? `http://localhost:${PORT}/${process.env.BASE_API}`
    : `https://www.nexodev.org/api`;

axios.defaults.baseURL = BASE_URL;

const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});
axios.defaults.httpsAgent = httpsAgent;

describe(`GET 'Test' API Request `, async () => {
  {
    const url = `${BASE_URL}/test/youtube-id/?url=https://www.youtube.com/watch?v=o4f42SbyDMk`;
    it(`youtube id from raw youtube url`, async () => {
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data).equal('o4f42SbyDMk');
    });
  }
  {
    const email = 'test@gmail.com';
    const url = `${BASE_URL}/test/verify-email/?email=${email}`;
    it(`valid format email`, async () => {
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data).equal(true);
    });
  }
  {
    const password = 'Password123!';
    const url = `${BASE_URL}/test/is-strong-password/?password=${password}`;
    it(`valid password`, async () => {
      logger.info('request info', { url });
      const res = await axios.get(url);
      logger.info('response', res.data);
      return expect(res.data.data.length).equal(0);
    });
  }
});
