'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import { JSONweb, random, range } from './util.js';
dotenv.config();

const cyberiaTypes = {
    floor: {},
    building: {}
};

const elements = [];

const minRangeMap = 0;
const maxRangeMap = 31;

const matrix = range(minRangeMap, maxRangeMap).map(y => {
    return range(minRangeMap, maxRangeMap).map(x => random(0, 1));
});

const ssrCyberia = `
    const CYBERIAONLINE = {
        types: ${JSONweb(cyberiaTypes)},
        matrix: ${JSONweb(matrix)}
    };
    console.log('CYBERIAONLINE', CYBERIAONLINE);
`;


const apiCyberia = app => {

};


export { apiCyberia, ssrCyberia };