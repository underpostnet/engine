'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import { JSONweb, random, range, s4, JSONmatrix } from './util.js';
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
    let collision = false;
    range(0, A.dim - 1).map(yA => {
        range(0, A.dim - 1).map(xA => {
            range(0, B.dim - 1).map(yB => {
                range(0, B.dim - 1).map(xB => {
                    if (
                        (A.x + xA) === (B.x + xB)
                        &&
                        (A.y + yA) === (B.y + yB)
                    ) {
                        collision = true;
                    }
                });
            });
        });
    });
    return collision;
};

const common = `
    const id = ${id};
    const matrixIterator = ${matrixIterator};
    const validateCollision = ${validateCollision};
`;

// end common

matrixIterator(CYBERIAONLINE, (x, y) => {
    // if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;
    if (random(1, 100) <= 2) {
        const type = 'building';
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

matrixIterator(CYBERIAONLINE, (x, y) => {
    // if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;
    if (random(1, 100) <= 1) {
        const dim = 2;
        const element = elements.find(element => validateCollision(
            element.render,
            { x, y, dim }
        ));
        if (!element) {
            const type = 'bot';
            elements.push({
                id: id(elements),
                type,
                color: typeModels[type].color,
                render: {
                    x,
                    y,
                    dim
                }
            });
        }
    }
});

// test
const matrix = range(minRangeMap, maxRangeMap).map(y => {
    return range(minRangeMap, maxRangeMap).map(x => {
        const element = elements.find(element => validateCollision(
            element.render,
            { x, y, dim: 1 }
        ));
        if (element) return Object.keys(typeModels).indexOf(element.type);
        return 0;
    });
});

// console.table(matrix);

if (!fs.existsSync('./data/cyberia'))
    fs.mkdirSync('./data/cyberia', { recursive: true });

fs.writeFileSync('./data/cyberia/matrix.json', JSONmatrix(matrix), 'utf8');

// end test

const ssrCyberia = `
    const ssrCYBERIAONLINE = ${JSONweb(CYBERIAONLINE)};
    ${common}
`;

const apiCyberia = app => {

};


export { apiCyberia, ssrCyberia };