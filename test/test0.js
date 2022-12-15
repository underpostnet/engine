'use strict';

import assert from 'assert';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

describe(' Main Test: ', () => {

    describe('Test 1', () => {
        it('getHash', async () => {
            axios.get(`http://localhos:${process.env.PORT}/api/util/getHash`).then(resp => {
                // actual, expected
                assert.strictEqual(resp.data.split('-').length, 5);
            });
        });
    });

    describe('Test 2', () => {
        it('randomColor', async () => {
            axios.get(`http://localhos:${process.env.PORT}/api/util/randomColor`).then(resp => {
                // actual, expected
                assert.strictEqual(resp[0], '#');
            });
        });
    });

    describe('Test 3', () => {
        it('emailValidator', async () => {
            const emailTest = 'test@gmail.com';
            axios.get(`http://localhos:${process.env.PORT}/api/util/emailValidator/?email=${emailTest}`).then(resp => {
                // actual, expected
                assert.strictEqual(JSON.parse(resp).validate, true);
            });
        });
    });

    describe('Test 4', () => {
        it('getYouTubeID', async () => {
            axios.get(`http://localhos:${process.env.PORT}/api/util/getYouTubeID?url=https://www.youtube.com/watch?v=o4f42SbyDMk`).then(resp => {
                // actual, expected
                assert.strictEqual(resp, 'o4f42SbyDMk');
            });
        });
    });

});
