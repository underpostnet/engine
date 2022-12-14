#!/usr/bin/env node

'use strict';

import * as handleInput from '..';

process.stdin.resume();
process.stdin.setEncoding('utf8');

let input = '';

process.stdin.on('data', chunk => {
    input += chunk;
});

process.stdin.on('end', () => {
    handleInput(input, err => {
        if (err) {
            throw err;
        }
    });
});