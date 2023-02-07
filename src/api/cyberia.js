'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import { JSONweb, random, range, s4 } from './util.js';
import { numberColors } from '../modules/colors.js';
dotenv.config();

const typeModels = {
    'building': {
        color: numberColors['red']
    },
    'floor': {
        color: numberColors['green (html/css color)']
    }
};

const minRangeMap = 0;
const maxRangeMap = 31;
const amplitudeRangeMap = 10;
const elements = [];

const CYBERIAONLINE = {
    minRangeMap,
    maxRangeMap,
    amplitudeRangeMap,
    elements,
    typeModels
};


const id = elements => {
    let _id = 'x' + s4() + s4();
    while (elements.filter(x => x.id === _id).length > 0) {
        _id = 'x' + s4() + s4();
    }
    return _id;
};

const matrixIterator = (CYBERIAONLINE, fn) =>
    range(CYBERIAONLINE.minRangeMap, maxRangeMap).map(y =>
        range(CYBERIAONLINE.minRangeMap, maxRangeMap).map(x =>
            fn(x, y)
        )
    );

matrixIterator(CYBERIAONLINE, (x, y) => {
    if (x >= maxRangeMap - 1 || y >= maxRangeMap - 1) return;
    const type = 'floor';
    elements.push({
        id: id(elements),
        type,
        color: typeModels[type].color,
        x: amplitudeRangeMap * x,
        y: amplitudeRangeMap * y,
        dim: 1 * amplitudeRangeMap
    });
})

matrixIterator(CYBERIAONLINE, (x, y) => {
    if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;
    if (random(1, 100) <= 10) {
        const type = 'building';
        elements.push({
            id: id(elements),
            type,
            color: typeModels[type].color,
            x: amplitudeRangeMap * x,
            y: amplitudeRangeMap * y,
            dim: 1 * amplitudeRangeMap
        });
    }
});

const ssrCyberia = `
    const ssrCYBERIAONLINE = ${JSONweb(CYBERIAONLINE)};
    const id = ${id};
    const matrixIterator = ${matrixIterator};
`;

const apiCyberia = app => {

};


export { apiCyberia, ssrCyberia };