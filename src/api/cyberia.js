'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import pathfinding from 'pathfinding';
import { JSONweb, random, range, s4, JSONmatrix } from './util.js';
import { logger } from '../modules/logger.js';

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
    for (const yA of range(0, A.dim - 1)) {
        for (const xA of range(0, A.dim - 1)) {
            for (const yB of range(0, B.dim - 1)) {
                for (const xB of range(0, B.dim - 1)) {
                    if (
                        (A.x + xA) === (B.x + xB)
                        &&
                        (A.y + yA) === (B.y + yB)
                    ) {
                        return true;
                    }
                };
            };
        };
    };
    return false;
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

const wsCyberia = () => {

    const clients = [];

    const server = new WebSocket.Server({ port: process.env.CYBERIA_WS_PORT })
        .on('connection', async ws => {

            clients.push(ws);

            ws.on('close', () => {
                clients.splice(clients.indexOf(ws), 1);
            });

            ws.on('message', msg => { });

        });

    // const grid = new PF.Grid(matrix.length, matrix.length, matrix);
    //     const finder = new PF.AStarFinder({
    //         allowDiagonal: true, // enable diagonal
    //         dontCrossCorners: false, // corner of a solid
    //         heuristic: PF.Heuristic.chebyshev
    //     });
    //     return finder.findPath(parseInt(element.x), parseInt(element.y), newX !== undefined ? newX : x, newY !== undefined ? newY : y, grid);

    const bots = {};
    setInterval(() => {
        elements.map(element => {
            if (element.type === 'bot') {

                if (!bots[element.id]) bots[element.id] = {
                    path: []
                };
                bots[element.id].path.shift();

                if (bots[element.id].path.length === 0) {

                    bots[element.id].path = range(0, maxRangeMap).map(i => [i, i]);

                }

                element.render.x = bots[element.id].path[0][0];
                element.render.y = bots[element.id].path[0][1];

                clients.map(client => {

                    client.send(JSON.stringify(element));
                });

            }
        });
    }, 10);

    setTimeout(() => logger.info(`Ws Cyberia Server is running on port ${process.env.CYBERIA_WS_PORT}`));

    return { clients, server };
};


wsCyberia();

const apiCyberia = app => { };


export { apiCyberia, ssrCyberia };