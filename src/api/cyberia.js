'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import { JSONweb, random, range, s4 } from './util.js';
import { getRandomNumberColors, numberColors } from '../modules/colors.js';
dotenv.config();

const CYBERIAONLINE = {
    minRangeMap: 0,
    maxRangeMap: 31,
    amplitudeRangeMap: 5,
    elements: []
};


const id = elements => {
    let _id = 'x' + s4() + s4();
    while (elements.filter(x => x.id === _id).length > 0) {
        _id = 'x' + s4() + s4();
    }
    return _id;
};

range(CYBERIAONLINE.minRangeMap, CYBERIAONLINE.maxRangeMap).map(y => {
    range(CYBERIAONLINE.minRangeMap, CYBERIAONLINE.maxRangeMap).map(x => {

        if (random(1, 100) <= 25) {
            const type = ['floor', 'building'][random(0, 1)];

            CYBERIAONLINE.elements.push({
                id: id(CYBERIAONLINE.elements),
                type,
                x,
                y,
                dim: 3
            });

        }
    });
});

const ssrCyberia = `
    const numberColors = ${JSONweb(numberColors)};
    const getRandomNumberColors = ${getRandomNumberColors()};
    const ssrCYBERIAONLINE = ${JSONweb(CYBERIAONLINE)};
    const id = ${id};
`;

const apiCyberia = app => {

};


export { apiCyberia, ssrCyberia };