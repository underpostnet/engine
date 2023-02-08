'use strict';
import fs from 'fs';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import pathfinding from 'pathfinding';
import { JSONweb, random, range, s4, JSONmatrix } from './util.js';
import { logger } from '../modules/logger.js';

dotenv.config();



const minRangeMap = 0;
const maxRangeMap = 31;

const typeModels = {
    'floor': {
        gen: {
            color: () => 'green (html/css color)',
            dim: () => maxRangeMap
        }
    },
    'building': {
        gen: {
            color: () => 'black',
            dim: () => 2
        }
    },
    'bot': {
        gen: {
            color: () => 'yellow',
            dim: () => 2
        }
    }
};



// common

const getAllElements = typeModels => {
    let elements = [];
    Object.keys(typeModels).map(keyType => {
        elements = elements.concat(typeModels[keyType].elements);
    });
    return elements;
};

const id = (typeModels) => {
    let _id = 'x' + s4() + s4();
    while (getAllElements(typeModels).find(x => x.id === _id))
        _id = 'x' + s4() + s4();
    return _id;
};

const matrixIterator = (MAIN, fn) =>
    range(MAIN.minRangeMap, MAIN.maxRangeMap).map(y =>
        range(MAIN.minRangeMap, MAIN.maxRangeMap).map(x =>
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
    const getAllElements = ${getAllElements};
    const id = ${id};
    const matrixIterator = ${matrixIterator};
    const validateCollision = ${validateCollision};
`;

// end common

const MAIN = {
    minRangeMap,
    maxRangeMap,
    typeModels
};

const getParamsType = type => {
    return {
        color: typeModels[type].gen.color(),
        dim: typeModels[type].gen.dim()
    }
};

Object.keys(typeModels).map(keyType => {
    typeModels[keyType].elements = [];
});

(() => {
    const type = 'floor';
    const { color, dim } = getParamsType(type);
    typeModels[type].elements.push({
        id: id(typeModels),
        type,
        color,
        render: {
            x: 0,
            y: 0,
            dim
        }
    });
})()

matrixIterator(MAIN, (x, y) => {
    // if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;
    if (random(1, 100) <= 2) {

        const type = 'building';
        const { color, dim } = getParamsType(type);

        typeModels[type].elements.push({
            id: id(typeModels),
            type,
            color,
            render: {
                x,
                y,
                dim
            }
        });
    }
});




const ssrCyberia = `
    const ssrMAIN = ${JSONweb(MAIN)};
    ${common}
`;

const wsCyberia = () => {

    matrixIterator(MAIN, (x, y) => {
        // if (x > maxRangeMap - 1 || y > maxRangeMap - 1) return;
        if (random(1, 100) <= 1) {

            const type = 'bot';
            const { color, dim } = getParamsType(type);

            const buildingElement = typeModels['building'].elements.find(element => validateCollision(
                element.render,
                { x, y, dim }
            ));
            const botElement = typeModels['bot'].elements.find(element => validateCollision(
                element.render,
                { x, y, dim }
            ));

            if (!buildingElement && !botElement) {
                typeModels[type].elements.push({
                    id: id(typeModels),
                    type,
                    color,
                    render: {
                        x,
                        y,
                        dim
                    }
                });
            }
        }
    });


    if (!fs.existsSync('./data/cyberia'))
        fs.mkdirSync('./data/cyberia', { recursive: true });

    // test
    const matrix = range(minRangeMap, maxRangeMap).map(y => {
        return range(minRangeMap, maxRangeMap).map(x => {
            const botElement = typeModels['bot'].elements.find(element => validateCollision(
                element.render,
                { x, y, dim: 1 }
            ));
            const buildingElement = typeModels['building'].elements.find(element => validateCollision(
                element.render,
                { x, y, dim: 1 }
            ));
            if (botElement) return Object.keys(typeModels).indexOf(botElement.type);
            if (buildingElement) return Object.keys(typeModels).indexOf(buildingElement.type);
            return 0;
        });
    });


    fs.writeFileSync('./data/cyberia/matrix.json', JSONmatrix(matrix), 'utf8');


    const matrixCollisionBotBuilding = range(minRangeMap, maxRangeMap).map(y => {
        return range(minRangeMap, maxRangeMap).map(x => {
            const dim = typeModels['bot'].gen.dim();
            const buildingElement = typeModels['building'].elements.find(element => validateCollision(
                element.render,
                { x, y, dim }
            ));
            if (buildingElement) return 1;
            return 0;
        });
    });


    fs.writeFileSync('./data/cyberia/matrixCollisionBotBuilding.json', JSONmatrix(matrixCollisionBotBuilding), 'utf8');

    // end test

    const clients = [];

    const server = new WebSocket.Server({ port: process.env.CYBERIA_WS_PORT })
        .on('connection', async ws => {

            clients.push(ws);

            ws.on('close', () => {
                clients.splice(clients.indexOf(ws), 1);
            });

            ws.on('message', msg => { });

        });


    const gridMatrixCollisionBotBuilding =
        new pathfinding.Grid(matrixCollisionBotBuilding);
    const finderMatrixCollisionBotBuilding = pathfinding.AStarFinder({
        allowDiagonal: true, // enable diagonal
        dontCrossCorners: false, // corner of a solid
        heuristic: pathfinding.Heuristic.chebyshev
    });
    // return finder.findPath(parseInt(element.x), parseInt(element.y), newX !== undefined ? newX : x, newY !== undefined ? newY : y, grid);



    setInterval(() => {
        getAllElements(typeModels).map(element => {
            if (element.type === 'bot') {

                if (!element.path) element.path = [];
                element.path.shift();

                if (element.path.length === 0) {

                    element.path = range(0, maxRangeMap).map(i => [i, i]);

                }

                element.render.x = element.path[0][0];
                element.render.y = element.path[0][1];

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