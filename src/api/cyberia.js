'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import { JSONweb, random, range, s4 } from './util.js';
dotenv.config();

const typeModels = {
    'floor': {
        color: 'green (html/css color)'
    },
    'building': {
        color: 'red'
    },
    'bot': {
        color: 'yellow'
    }
};

const minRangeMap = 0;
const maxRangeMap = 31;
const elements = [];

const CYBERIAONLINE = {
    minRangeMap,
    maxRangeMap,
    elements,
    typeModels
};

// common

const id = elements => {
    let _id = 'x' + s4() + s4();
    while (elements.filter(x => x.id === _id).length > 0) {
        _id = 'x' + s4() + s4();
    }
    return _id;
};

const matrixIterator = (CYBERIAONLINE, fn) =>
    range(CYBERIAONLINE.minRangeMap, CYBERIAONLINE.maxRangeMap).map(y =>
        range(CYBERIAONLINE.minRangeMap, CYBERIAONLINE.maxRangeMap).map(x =>
            fn(x, y)
        )
    );

const validateCollision = (A, B) => {
    return (
        (A.y - A.dim) < (B.y + B.dim)
        &&
        (A.x + A.dim) > (B.x - B.dim)
        &&
        (A.y + A.dim) > (B.y - B.dim)
        &&
        (A.x - A.dim) < (B.x + B.dim)
    )
};

const common = `
    const id = ${id};
    const matrixIterator = ${matrixIterator};
    const validateCollision = ${validateCollision};
`;

// end common

matrixIterator(CYBERIAONLINE, (x, y) => {

    // if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;

    if (random(1, 100) <= 3) {
        const type = 'building';
        elements.push({
            id: id(elements),
            type,
            color: typeModels[type].color,
            render: {
                x,
                y,
                dim: 1
            }
        });
    } else if (random(1, 100) <= 1) {
        const type = 'bot';
        elements.push({
            id: id(elements),
            type,
            color: typeModels[type].color,
            render: {
                x,
                y,
                dim: 2
            }
        });
    }
});

// test
const matrix = range(minRangeMap, maxRangeMap).map(y => {
    return range(minRangeMap, maxRangeMap).map(x => {
        const element = elements.find(element => {
            // return validateCollision(
            //     element.render,
            //     { x, y, dim: 0 }
            // )
            let valid = false;
            range(0, element.render.dim - 1).map(y0 => {
                range(0, element.render.dim - 1).map(x0 => {
                    if (x === element.render.x + x0 && y === element.render.y + y0) {
                        valid = true;
                    }
                });
            });
            return valid;
        });
        if (element) return Object.keys(typeModels).indexOf(element.type);
        return 0;
    });
});

// console.table(matrix);

if (!fs.existsSync('./data/cyberia'))
    fs.mkdirSync('./data/cyberia', { recursive: true });

fs.writeFileSync('./data/cyberia/matrix.json',
    `[\r\n${matrix.map((x, i) =>
        `   `
        + JSON.stringify(x)
        + (i === matrix.length - 1 ? '' : ',')
        + '\r\n').join('')}]`, 'utf8');

// end test

const ssrCyberia = `
    const ssrCYBERIAONLINE = ${JSONweb(CYBERIAONLINE)};
    ${common}
`;

const apiCyberia = app => {

};


export { apiCyberia, ssrCyberia };