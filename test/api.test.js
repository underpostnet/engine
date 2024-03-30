'use strict';

import assert from 'assert';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT + 1;

describe(' Main Test: ', () => {
  describe('Test 1', () => {
    it('emailValidator', async () => {
      const emailTest = 'test@gmail.com';
      axios
        .get(`http://localhos:${PORT}/${process.env.BASE_API}/test/verify-email/?email=${emailTest}`)
        .then((resp) => {
          // actual, expected
          assert.strictEqual(JSON.parse(resp).status, 'success');
        });
    });
  });

  describe('Test 2', () => {
    it('getYouTubeID', async () => {
      axios
        .get(
          `http://localhos:${PORT}/${process.env.BASE_API}/test/youtube-id?url=https://www.youtube.com/watch?v=o4f42SbyDMk`,
        )
        .then((resp) => {
          // actual, expected
          const result = JSON.parse(resp);
          assert.strictEqual(result.status, 'success');
          assert.strictEqual(result.data, 'o4f42SbyDMk');
        });
    });
  });
});
