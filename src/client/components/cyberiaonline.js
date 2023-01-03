

this.cyberiaonline = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();
        let elements = [];
        const minRangeMap = 0;
        const maxRangeMap = 32;
        const pixiAmplitudeFactor = window.innerWidth < (maxRangeMap * 20) ? 10 : 20;
        this.canvasDim = maxRangeMap * pixiAmplitudeFactor;
        const timeIntervalGame = 1;




        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (elementClient, attr, fn, elementsCollisions) => {

            let originElementClient = newInstance(elementClient);
            elementClient[attr] = fn(elementClient[attr]);

            if (elementClient[attr] === minRangeMap)
                elementClient[attr]++;
            if (elementClient[attr] === maxRangeMap)
                elementClient[attr]--;

            if (originElementClient[attr] === minRangeMap)
                originElementClient[attr]++;
            if (originElementClient[attr] === maxRangeMap)
                originElementClient[attr]--;

            if (elementsCollisions) {
                for (element of elements) {
                    if (
                        elementsCollisions.includes(element.type)
                        &&
                        element.id != elementClient.id
                        &&
                        validateCollision(element, elementClient)
                    ) {
                        return originElementClient[attr];
                    }
                }
            }

            if (elementClient[attr] < (minRangeMap + ((elementClient.dim) / 2))) return originElementClient[attr];
            if (elementClient[attr] > (maxRangeMap - ((elementClient.dim) / 2))) return originElementClient[attr];

            return elementClient[attr];
        };

        const validateCollision = (A, B) => {
            return (
                (A.y - (A.dim / 2)) < (B.y + (B.dim / 2))
                &&
                (A.x + (A.dim / 2)) > (B.x - (B.dim / 2))
                &&
                (A.y + (A.dim / 2)) > (B.y - (B.dim / 2))
                &&
                (A.x - (A.dim / 2)) < (B.x + (B.dim / 2))
            )
        };

        const alertCollision = element => {
            return (element.type != 'BUILDING') &&

                elements.filter(x => (

                    validateCollision(x, element)
                    &&
                    element.id != x.id
                )).length > 0;
        }

        const getAvailablePosition = (elementClient, elementsCollisions) => {

            let x, y, type;

            if (elementsCollisions.x && elementsCollisions.y) {
                type = 'snail';
                x = parseInt(`${elementsCollisions.x}`);
                y = parseInt(`${elementsCollisions.y}`);
                elementsCollisions = [].concat(elementsCollisions.elementsCollisions);
            } else {
                type = 'random';
                x = random(minRangeMap, maxRangeMap);
                y = random(minRangeMap, maxRangeMap);
            }

            const matrix = range(minRangeMap, maxRangeMap).map(y => {
                return range(minRangeMap, maxRangeMap).map(x => {
                    return elements.filter(element =>
                        elementsCollisions.includes(element.type)
                        &&
                        validateCollision(
                            { x: element.x, y: element.y, dim: element.dim },
                            { x, y, dim: elementClient.dim }
                        )).length > 0
                        || x === maxRangeMap
                        || x === minRangeMap
                        || y === maxRangeMap
                        || y === minRangeMap ? 1 : 0;
                });
            });


            switch (type) {
                case 'random':

                    while (matrix[y][x] === 1) {
                        x = random(minRangeMap, maxRangeMap);
                        y = random(minRangeMap, maxRangeMap);
                    }
                    break;
                case 'snail':
                    const matrixAux = newInstance(matrix);
                    let sum = true;
                    let xTarget = true;
                    let contBreak = 0;
                    let valueChange = 1;
                    let currentChange = 0;
                    let listFindPoint = [];
                    while (matrixAux[y][x] !== 0) {
                        currentChange++;
                        if (sum) {
                            console.log('snail', `${xTarget ? 'x' : 'y'}`, `+`, `${currentChange}/${valueChange}`);
                            if (xTarget) x = x + 1;
                            else y = y + 1;
                        } else {
                            console.log('snail', `${xTarget ? 'x' : 'y'}`, `-`, `${currentChange}/${valueChange}`);
                            if (xTarget) x = x - 1;
                            else y = y - 1;
                        }
                        if (currentChange === valueChange) {
                            currentChange = 0;
                            if (xTarget) xTarget = false;
                            else xTarget = true;
                            contBreak++;
                            if (contBreak === 2) {
                                contBreak = 0;
                                valueChange++;
                                if (sum) sum = false;
                                else sum = true;
                            }
                        }
                        if (!matrixAux[y]) {
                            matrixAux[y] = [];
                        }
                        if (matrixAux[y][x] === 0
                            &&
                            generatePath(elementClient, x === maxRangeMap ? x - 1 : x, y === maxRangeMap ? y - 1 : y).length === 0) {
                            matrixAux[y][x] = 1;
                        }
                        listFindPoint.push({ x, y });
                        // console.log('listFindPoint', listFindPoint, matrixAux[y][x]);
                    }
                    break
                case '*':
                    let contTest = 1;
                    while (matrix[y][x] === 1) {
                        const validPoints = [];
                        if (matrix[y + contTest] && matrix[y + contTest][x] === 0) {
                            validPoints.push([y + contTest, x]);
                        }
                        if (matrix[y - contTest] && matrix[y - contTest][x] === 0) {
                            validPoints.push([y - contTest, x]);
                        }
                        if (matrix[y + contTest] && matrix[y + contTest][x + contTest] === 0) {
                            validPoints.push([y + contTest, x + contTest]);
                        }
                        if (matrix[y + contTest] && matrix[y + contTest][x - contTest] === 0) {
                            validPoints.push([y + contTest, x - contTest]);
                        }
                        if (matrix[y - contTest] && matrix[y - contTest][x + contTest] === 0) {
                            validPoints.push([y - contTest, x + contTest]);
                        }
                        if (matrix[y - contTest] && matrix[y - contTest][x - contTest] === 0) {
                            validPoints.push([y - contTest, x - contTest]);
                        }
                        if (matrix[y] && matrix[y][x + contTest] === 0) {
                            validPoints.push([y, x + contTest]);
                        }
                        if (matrix[y] && matrix[y][x - contTest] === 0) {
                            validPoints.push([y, x - contTest]);
                        }
                        if (validPoints.length > 0) {
                            const newPoint = validPoints[random(0, validPoints.length - 1)];
                            x = newPoint[1];
                            y = newPoint[0];
                        }
                        contTest++;
                    }
                    break;

                default:
                    break;
            }
            return { x, y, matrix };
        };

        const generatePath = (element, newX, newY) => {
            const { x, y, matrix } = getAvailablePosition(element, ['BUILDING']);

            const grid = new PF.Grid(matrix.length, matrix.length, matrix);
            const finder = new PF.AStarFinder({
                allowDiagonal: false,
                dontCrossCorners: false,
                heuristic: PF.Heuristic.chebyshev
            });
            return finder.findPath(parseInt(element.x), parseInt(element.y), newX ? newX : x, newY ? newY : y, grid);
        };

        const validatePathLoop = element => {
            if (element.path[0]) {
                element.delayVelPath = element.delayVelPath + element.vel;

                if (element.path[0][0] - element.x > 0)
                    element.x = element.x + element.vel;
                if (element.path[0][0] - element.x < 0)
                    element.x = element.x - element.vel;

                if (element.path[0][1] - element.y > 0)
                    element.y = element.y + element.vel;
                if (element.path[0][1] - element.y < 0)
                    element.y = element.y - element.vel;

                if (element.delayVelPath > 1) {
                    element.delayVelPath = 0;
                    element.x = parseInt(element.path[0][0]);
                    element.y = parseInt(element.path[0][1]);
                    element.path.shift();
                }
            }
            return element;
        };


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        // https://pixijs.io/examples
        // https://pixijs.download/release/docs/index.html
        // https://www.w3schools.com/colors/colors_picker.asp

        const pixiContainerId = id();
        const app = new PIXI.Application({ width: maxRangeMap * pixiAmplitudeFactor, height: maxRangeMap * pixiAmplitudeFactor, background: 'gray' });
        const container = new PIXI.Container(); // create container
        this.htmlPixiLayer = id();

        const colors = {
            'red': numberHexColor('#ff0000'),
            'green': numberHexColor('#33cc33'),
            'yellow': numberHexColor('#ffff00'),
            'black': numberHexColor('#000000'),
            'magenta': numberHexColor('#ff33cc')
        };

        const PIXI_INIT = () => {

            s(pixiContainerId).appendChild(app.view);
            app.stage.addChild(container); // container to pixi app
            container.x = 0;
            container.y = 0;
            container.width = maxRangeMap * pixiAmplitudeFactor;
            container.height = maxRangeMap * pixiAmplitudeFactor;
            setTimeout(() => {

                append(pixiContainerId, /*html*/`
                <style class='${this.htmlPixiLayer}'></style>

                <${this.htmlPixiLayer} class='abs'>
                    v3.0.0
                </${this.htmlPixiLayer}>
            
                `);

                this.renderHtmlPixiLayer();

                s(this.htmlPixiLayer).onclick = event =>
                    elements.map(x =>
                        x.onCanvasClick ? x.onCanvasClick(event)
                            : null);

            });
        };

        const elementsContainer = {};
        const elementsBackground = {};
        const elementsHead = {};
        const PIXI_INIT_ELEMENT = element => {

            // /assets/apps/cyberiaonline

            // elementsContainer[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
            elementsContainer[element.id] = new PIXI.Container();
            elementsContainer[element.id].x = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            elementsContainer[element.id].y = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
            elementsContainer[element.id].width = (element.dim) * pixiAmplitudeFactor;
            elementsContainer[element.id].height = (element.dim) * pixiAmplitudeFactor;
            // elementsContainer[element.id].rotation = -(Math.PI / 2);
            container.addChild(elementsContainer[element.id]); // sprite to containers

            elementsBackground[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
            elementsBackground[element.id].x = 0;
            elementsBackground[element.id].y = 0;
            elementsBackground[element.id].width = (element.dim) * pixiAmplitudeFactor;
            elementsBackground[element.id].height = (element.dim) * pixiAmplitudeFactor;
            elementsBackground[element.id].tint = colors[element.color];
            elementsContainer[element.id].addChild(elementsBackground[element.id]);

            switch (element.type) {
                case 'USER_MAIN':
                    elementsHead[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    elementsHead[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 2;
                    elementsHead[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 2;
                    elementsHead[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 4;
                    elementsHead[element.id].y = 0;
                    elementsContainer[element.id].addChild(elementsHead[element.id]);

                    break;

                default:
                    break;
            }

            // const headCircle = new PIXI.Graphics();
            // headCircle.beginFill(0x3333ff);
            // headCircle.lineStyle(0);
            // headCircle.drawCircle(100, 30, 25); // x,y,radio
            // headCircle.endFill();
            // headCircle.width = 50;
            // headCircle.height = 50;
            // container.addChild(headCircle);

        }

        const PIXI_LOOP_ELEMENT = element => {

            if (alertCollision(element)) {
                elementsBackground[element.id].tint = colors["magenta"];
            } else if (elementsBackground[element.id].tint != colors[element.color]) {
                elementsBackground[element.id].tint = colors[element.color];
            }

            elementsContainer[element.id].x = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            elementsContainer[element.id].y = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const gen = () => {
            return {
                init: function (options) {
                    this.id = id();
                    this.x = options.x !== undefined ? options.x : random(minRangeMap, maxRangeMap);
                    this.y = options.y !== undefined ? options.y : random(minRangeMap, maxRangeMap);
                    this.container = options.container;
                    this.type = options.type;
                    this.delayVelPath = 0;
                    this.vel = 0.1;
                    this.dim = 1.5;
                    this.color = 'red';
                    this.path = [];
                    this.borderRadius = 100;
                    switch (this.type) {
                        case 'BUILDING':
                            this.color = 'black';
                            this.borderRadius = 0;
                            break;
                        case 'USER_MAIN':
                            if (!(options.x && options.y)) {
                                const USER_MAIN_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = USER_MAIN_getAvailablePosition.x;
                                this.y = USER_MAIN_getAvailablePosition.y;
                            }
                            this.color = 'yellow';
                            break;
                        case 'BOT':
                            if (!(options.x && options.y)) {
                                const BOT_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BOT_getAvailablePosition.x;
                                this.y = BOT_getAvailablePosition.y;
                            }
                            this.color = 'green';
                            break;
                        case 'BOT_BUG':
                            this.x = maxRangeMap;
                            this.y = minRangeMap;
                        default:
                            break;
                    }
                    PIXI_INIT_ELEMENT(this);
                    // append(this.container, /*html*/`
                    //         <style class='${this.id}'></style>
                    //         <style>
                    //             ${this.id} {
                    //                 border-radius: ${this.borderRadius}%;
                    //                 background: ${this.color};
                    //                 width: ${this.dim}%;
                    //                 height: ${this.dim}%;
                    //             }
                    //         </style>
                    //         <${this.id} class='abs'></${this.id}>
                    // `);
                    switch (this.type) {
                        case 'USER_MAIN':
                            if (this.ArrowLeft) stopListenKey(this.ArrowLeft);
                            this.ArrowLeft = startListenKey({
                                key: 'ArrowLeft',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.x = validatePosition(this, 'x', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            if (this.ArrowRight) stopListenKey(this.ArrowRight);
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.x = validatePosition(this, 'x', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            if (this.ArrowUp) stopListenKey(this.ArrowUp);
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.y = validatePosition(this, 'y', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            if (this.ArrowDown) stopListenKey(this.ArrowDown);
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.y = validatePosition(this, 'y', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            this.onCanvasClick = event => {
                                // off -> this.canvasDim
                                // x -> 50
                                let offsetX = parseInt(((event.offsetX * maxRangeMap) / cyberiaonline.canvasDim)) + 1;
                                let offsetY = parseInt(((event.offsetY * maxRangeMap) / cyberiaonline.canvasDim)) + 1;

                                const { x, y, matrix } = getAvailablePosition(this,
                                    {
                                        x: offsetX,
                                        y: offsetY,
                                        elementsCollisions: ['BUILDING']
                                    }
                                );
                                offsetX = x;
                                offsetY = y;
                                console.log('onCanvasClick', event, offsetX, offsetY);
                                this.path = generatePath(this, offsetX === maxRangeMap ? offsetX - 1 : offsetX, offsetY === maxRangeMap ? offsetY - 1 : offsetY);
                            };
                            break;

                        default:
                            break;
                    }
                    if (options.matrix)
                        range(0, options.matrix.x - 1)
                            .map(x =>
                                range(0, options.matrix.y - 1)
                                    .map(y => {
                                        if (!(x === 0 && y === 0)) {
                                            const replicaOtions = newInstance(options);
                                            delete replicaOtions.matrix;
                                            elements.push(
                                                gen().init({
                                                    ...replicaOtions,
                                                    x: this.x + (this.dim * x),
                                                    y: this.y + (this.dim * y)
                                                })
                                            );
                                        }

                                    })
                            );
                    return this;
                },
                loop: function () {
                    let element;
                    switch (this.type) {
                        case 'BOT':
                            if (this.path.length === 0)
                                this.path = generatePath(this);


                            element = validatePathLoop(this);
                            this.path = element.path;
                            this.x = element.x;
                            this.y = element.y;

                            break;
                        case 'USER_MAIN':
                            element = validatePathLoop(this);
                            this.path = element.path;
                            this.x = element.x;
                            this.y = element.y;

                            break;
                        case 'BOT_BUG':
                            this.x = validatePosition(this, 'x',
                                pos => random(0, 1) === 0 ? pos + 0.2 : pos - 0.2);
                            this.y = validatePosition(this, 'y',
                                pos => random(0, 1) === 0 ? pos + 0.2 : pos - 0.2);

                            break;
                        default:
                            break;
                    }
                    PIXI_LOOP_ELEMENT(this);
                    //         htmls(`.${this.id}`,/*css*/`
                    //             ${this.id} {
                    //                 top: ${this.x - (this.dim / 2)}%;
                    //                 left: ${this.y - (this.dim / 2)}%;
                    //                 ${alertCollision(this) ? 'background: magenta !important;' : ''}
                    // }
                    //     `);
                }
            };
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        setTimeout(() => {

            PIXI_INIT();

            disableOptionsClick(pixiContainerId, ['drag', 'menu', 'select']);

            elements = elements.concat(
                range(0, 10)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BUILDING',
                        matrix: { x: 2, y: 3 }
                    }))
            );
            elements = elements.concat(
                range(1, 5)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BOT'
                    }))
            );
            elements = elements.concat(
                [
                    gen().init({
                        container: containerID,
                        type: 'USER_MAIN'
                        // matrix: { x: 2, y: 2 }
                    }),
                    // gen().init({
                    //     container: containerID,
                    //     type: 'BOT'
                    // }),
                    gen().init({
                        container: containerID,
                        type: 'BOT_BUG'
                    }),
                ]
            );

            console.log('elements', elements);

            if (this.loopGame) clearInterval(this.loopGame);
            const renderGame = () => elements.map(x => x.loop());
            renderGame();
            this.loopGame = setInterval(() => renderGame(), timeIntervalGame);

        });

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------


        return /*html*/`

            <div class='in container'>
                <style>
                    ${containerID} {
                        height: 450px;
                        width: 450px;
                        background: gray;
                    }

                    ${pixiContainerId} { 
                        cursor: pointer;
                    }

                    canvas {
                       /* transform: scale(-1, 1) rotate(90deg); */
                        display: block;
                        margin: auto;
                    }

                </style>
                <!--
                <${containerID} class='in'></${containerID}>
                -->
                <${pixiContainerId} class='in canvas-cursor'></${pixiContainerId}>
            </div>
        
        `
    },
    renderHtmlPixiLayer: function () {
        setTimeout(() => {
            if (!s('.' + this.htmlPixiLayer)) return;
            htmls('.' + this.htmlPixiLayer, /*css*/`
                ${this.htmlPixiLayer} {
                    height: ${this.canvasDim}px;
                    width: ${this.canvasDim}px;
                    transform: translate(-50%, 0%);
                    top: 0%;
                    left: 50%;
                    background: rgb(0,0,0,0);
                    color: yellow;
                    ${borderChar(2, 'black')}
                }
            `);
        });
    },
    routerDisplay: function (options) {
        this.renderHtmlPixiLayer();
    }
};