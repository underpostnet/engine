

this.cyberiaonline = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();
        let elements = [];
        const minRangeMap = 0;
        const maxRangeMap = 50;
        const pixiAmplitudeFactor = 10;
        let canvasDim;




        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (elementClient, attr, fn, elementsCollisions) => {

            const originElementClient = newInstance(elementClient);
            elementClient[attr] = fn(elementClient[attr]);

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

            if (elementClient[attr] < minRangeMap) return originElementClient[attr];
            if (elementClient[attr] > maxRangeMap) return originElementClient[attr];

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

            const matrix = range(minRangeMap, maxRangeMap).map(x => {
                return range(minRangeMap, maxRangeMap).map(y => {
                    return elements.filter(element =>
                        elementsCollisions.includes(element.type)
                        &&
                        validateCollision(
                            { x: element.x, y: element.y, dim: element.dim },
                            { x, y, dim: elementClient.dim }
                        )).length > 0 ? 1 : 0;
                });
            });

            let x = random(minRangeMap, maxRangeMap);
            let y = random(minRangeMap, maxRangeMap);

            while (matrix[x][y] == 1) {
                x = random(minRangeMap, maxRangeMap);
                y = random(minRangeMap, maxRangeMap);
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
            return finder.findPath(element.y, element.x, newX ? newX : x, newY ? newY : y, grid);
        };

        const validatePathLoop = element => {
            if (element.path[0]) {
                element.x = parseInt(element.path[0][1]);
                element.y = parseInt(element.path[0][0]);
                element.path.shift();
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
        const htmlPixiLayerTouch = id();

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
            canvasDim = s('canvas').clientHeight;

            append(pixiContainerId, /*html*/`

                <style>
                    ${htmlPixiLayerTouch} {
                        height: ${canvasDim}px;
                        width: ${canvasDim}px;
                        transform: translate(-50%, 0%);
                        top: 0%;
                        left: 50%;
                        background: rgb(0,0,0,0);
                        color: yellow;
                        ${borderChar(2, 'black')}
                    }
                </style>

                <${htmlPixiLayerTouch} class='abs'>
                    v3.0.0
                </${htmlPixiLayerTouch}>
            
                `);

            s(htmlPixiLayerTouch).onclick = event =>
                elements.map(x =>
                    x.onCanvasClick ? x.onCanvasClick(event)
                        : null);

        };

        const backgroundSprites = {};
        const PIXI_INIT_ELEMENT = element => {

            backgroundSprites[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
            backgroundSprites[element.id].x = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            backgroundSprites[element.id].y = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
            backgroundSprites[element.id].width = (element.dim) * pixiAmplitudeFactor;
            backgroundSprites[element.id].height = (element.dim) * pixiAmplitudeFactor;
            backgroundSprites[element.id].tint = colors[element.color];
            container.addChild(backgroundSprites[element.id]); // sprite to containers

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
                backgroundSprites[element.id].tint = colors["magenta"];
            } else if (backgroundSprites[element.id].tint != colors[element.color]) {
                backgroundSprites[element.id].tint = colors[element.color];
            }

            backgroundSprites[element.id].x = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            backgroundSprites[element.id].y = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
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
                    this.vel = 10;
                    this.dim = 3;
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
                                vel: this.vel,
                                onKey: () => {
                                    this.y = validatePosition(this, 'y', pos => pos - 1, ['BUILDING']);
                                }
                            });
                            if (this.ArrowRight) stopListenKey(this.ArrowRight);
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: this.vel,
                                onKey: () => {
                                    this.y = validatePosition(this, 'y', pos => pos + 1, ['BUILDING']);
                                }
                            });
                            if (this.ArrowUp) stopListenKey(this.ArrowUp);
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: this.vel,
                                onKey: () => {
                                    this.x = validatePosition(this, 'x', pos => pos - 1, ['BUILDING']);
                                }
                            });
                            if (this.ArrowDown) stopListenKey(this.ArrowDown);
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: this.vel,
                                onKey: () => {
                                    this.x = validatePosition(this, 'x', pos => pos + 1, ['BUILDING']);
                                }
                            });
                            this.onCanvasClick = event => {
                                // off -> canvasDim
                                // x -> 50
                                const offsetX = parseInt(((event.offsetX * maxRangeMap) / canvasDim));
                                const offsetY = parseInt(((event.offsetY * maxRangeMap) / canvasDim));
                                console.log('onCanvasClick', offsetX, offsetY);
                                this.path = generatePath(this, offsetX, offsetY);
                            };
                            break;

                        default:
                            break;
                    }
                    if (options.matrix)
                        range(0, options.matrix.y - 1)
                            .map(x =>
                                range(0, options.matrix.x - 1)
                                    .map(y => {
                                        if (!(x == 0 && y == 0)) {
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

            elements = elements.concat(
                range(0, 10)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BUILDING',
                        matrix: { x: 2, y: 3 }
                    }))
            );
            elements = elements.concat(
                range(0, 10)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BOT'
                    }))
            );
            elements = elements.concat(
                [
                    gen().init({
                        container: containerID,
                        type: 'USER_MAIN',
                        matrix: { x: 2, y: 2 }
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
            this.loopGame = setInterval(() => renderGame(), 1);

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

                    ${pixiContainerId} { }

                    canvas {
                        transform: scale(-1, 1) rotate(90deg);
                        display: block;
                        margin: auto;
                    }

                </style>
                <!--
                <${containerID} class='in'></${containerID}>
                -->
                <${pixiContainerId} class='in'></${pixiContainerId}>
            </div>
        
        `
    }

};