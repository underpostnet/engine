

this.cyberiaonline = {

    init: function () {


        let elements = [];
        const id = () => {
            let _id = 'x' + s4() + s4();
            while (elements.filter(x => x.id === _id).length > 0) {
                _id = 'x' + s4() + s4();
            }
            return _id;
        };
        const containerID = id();
        const minRangeMap = 0;
        const maxRangeMap = 32;
        const pixiAmplitudeFactor = window.innerWidth < (maxRangeMap * 20) ? 10 : 20;
        this.canvasDim = maxRangeMap * pixiAmplitudeFactor;
        const timeIntervalGame = 1;
        const newInstanceBtn = id();




        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (elementClient, attr, fn, elementsCollisions) => {

            let originElementClient = newInstance(elementClient);
            elementClient[attr] = fn(elementClient[attr]);

            // for big dim elements 
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
                        element.id !== elementClient.id
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
            return (element.type !== 'BUILDING') &&

                elements.filter(x => (

                    validateCollision(x, element)
                    &&
                    element.id !== x.id
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
                allowDiagonal: true, // enable diagonal
                dontCrossCorners: false, // corner of a solid
                heuristic: PF.Heuristic.chebyshev
            });
            return finder.findPath(parseInt(element.x), parseInt(element.y), newX ? newX : x, newY ? newY : y, grid);
        };

        const validatePathLoop = element => {
            if (element.path[0]) {
                element.delayVelPath = element.delayVelPath + element.vel;

                if (element.path[0][0] - element.x > 0) {
                    element.x = element.x + element.vel;
                    if (element.x > element.path[0][0]) element.x = element.path[0][0];
                }
                if (element.path[0][0] - element.x < 0) {
                    element.x = element.x - element.vel;
                    if (element.x < element.path[0][0]) element.x = element.path[0][0];
                }

                if (element.path[0][1] - element.y > 0) {
                    element.y = element.y + element.vel;
                    if (element.y > element.path[0][1]) element.y = element.path[0][1];
                }
                if (element.path[0][1] - element.y < 0) {
                    element.y = element.y - element.vel;
                    if (element.y < element.path[0][1]) element.y = element.path[0][1];
                }

                if (element.delayVelPath > 1) {
                    element.delayVelPath = 0;
                    // element.x = parseInt(element.path[0][0]);
                    // element.y = parseInt(element.path[0][1]);
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

        const iteratePixiColors = newInstance(colors);
        const pixiColors = {};
        iteratePixiColors.map(dataColor => {
            pixiColors[dataColor.name.toLowerCase()] = numberHexColor(dataColor.hex);
        });

        console.log('COLORS', colors);

        const PIXI_INIT = () => {


            // https://pixijs.download/dev/docs/PIXI.AnimatedSprite.html
            // /assets/apps/cyberiaonline/clases


            s(pixiContainerId).appendChild(app.view);
            app.stage.addChild(container); // container to pixi app
            container.x = 0;
            container.y = 0;
            container.width = maxRangeMap * pixiAmplitudeFactor;
            container.height = maxRangeMap * pixiAmplitudeFactor;

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


        };

        let elementsContainer = {};
        let elementsBackground = {};
        let elementsHead = {};
        let elementsEyesLeft = {};
        let elementsEyesRight = {};


        const animations = {
            'random-circle-color': {
                animationElements: {
                    circle: {}
                },
                init: function (element) {
                    this.animationElements.circle[element.id] = new PIXI.Graphics();
                    this.animationElements.circle[element.id].beginFill(randomNumberColor());
                    this.animationElements.circle[element.id].lineStyle(0);
                    this.animationElements.circle[element.id].drawCircle(0, 0, 1.5 * pixiAmplitudeFactor); // x,y,radio
                    this.animationElements.circle[element.id].endFill();
                    this.animationElements.circle[element.id].width = (element.dim * pixiAmplitudeFactor) / 4;
                    this.animationElements.circle[element.id].height = (element.dim * pixiAmplitudeFactor) / 4;
                    elementsContainer[element.id].addChild(this.animationElements.circle[element.id]);
                },
                loop: function (element) {
                    switch (element.animationFrame) {
                        case 0:
                            // console.error(1);
                            break;
                        case 100:
                            // console.error(2);
                            break;
                        case 200:
                            // console.error(3);
                            break;
                        case 300:
                            element.animationFrame = -1;
                            break;
                    }
                    element.animationFrame++;
                },
                delete: function (element) {
                    delete this.animationElements.circle[element.id]
                }
            }
        };

        const removeElement = id => {
            if (!elementsContainer[id]) {
                console.error('error delete', id, elements.find(x => x.id === id));
                return
            };
            elementsContainer[id].destroy({ children: true });
            delete elementsContainer[id];
            delete elementsBackground[id];
            delete elementsHead[id];
            delete elementsEyesLeft[id];
            delete elementsEyesRight[id];
            const elementIndex = elements.findIndex(x => x.id === id);
            // logDataManage(elements[elementIndex]);
            if (elementIndex > -1) {
                if (elements[elementIndex].animation) animations[elements[elementIndex].animation].delete(elements[elementIndex]);
                elements[elementIndex]
                    .clearsIntervals.map(keyInterval => clearInterval(elements[elementIndex][keyInterval]));
            }

            elements = elements.filter(x => x.id !== id);
        };

        const removeAllElements = () =>
            Object.keys(elementsContainer).map(key => removeElement(key));

        const PIXI_INIT_ELEMENT = element => {

            // /assets/apps/cyberiaonline

            // elementsContainer[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
            elementsContainer[element.id] = new PIXI.Container();
            elementsContainer[element.id].x = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            elementsContainer[element.id].y = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
            elementsContainer[element.id].width = (element.dim) * pixiAmplitudeFactor;
            elementsContainer[element.id].height = (element.dim) * pixiAmplitudeFactor;
            // elementsContainer[element.id].rotation = -(Math.PI / 2);
            // elementsContainer[element.id].pivot.x = elementsContainer[element.id].width / 2;
            // elementsContainer[element.id].pivot.y = elementsContainer[element.id].width / 2;
            container.addChild(elementsContainer[element.id]); // sprite to containers

            elementsBackground[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
            elementsBackground[element.id].x = 0;
            elementsBackground[element.id].y = 0;
            elementsBackground[element.id].width = (element.dim) * pixiAmplitudeFactor;
            elementsBackground[element.id].height = (element.dim) * pixiAmplitudeFactor;
            elementsBackground[element.id].tint = pixiColors[element.color];
            elementsContainer[element.id].addChild(elementsBackground[element.id]);

            switch (element.type) {
                case 'USER_MAIN':
                    elementsHead[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    elementsHead[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 2;
                    elementsHead[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 2;
                    elementsHead[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 4;
                    elementsHead[element.id].y = 0;
                    elementsContainer[element.id].addChild(elementsHead[element.id]);

                    elementsEyesLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    elementsEyesLeft[element.id].tint = pixiColors['blue'];
                    elementsEyesLeft[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    elementsEyesLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    elementsEyesLeft[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 3.25;
                    elementsEyesLeft[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(elementsEyesLeft[element.id]);

                    elementsEyesRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    elementsEyesRight[element.id].tint = pixiColors['blue'];
                    elementsEyesRight[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    elementsEyesRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    elementsEyesRight[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 1.75;
                    elementsEyesRight[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(elementsEyesRight[element.id]);

                    // elementsBackground[element.id].visible = false;

                    break;

                default:
                    break;
            };

            if (element.animation) animations[element.animation].init(element);

            // const headCircle = new PIXI.Graphics();
            // headCircle.beginFill(0x3333ff);
            // headCircle.lineStyle(0);
            // headCircle.drawCircle(100, 30, 25); // x,y,radio
            // headCircle.endFill();
            // headCircle.width = 50;
            // headCircle.height = 50;
            // container.addChild(headCircle);

        };

        const PIXI_LOOP_ELEMENT = element => {
            if (!elementsContainer[element.id]) {
                // bug pero si esta en elements
                console.error('!elementsContainer[element.id]');
                return;
            };

            if (alertCollision(element)) {
                elementsBackground[element.id].tint = pixiColors["magenta"];
            } else if (elementsBackground[element.id].tint !== pixiColors[element.color]) {
                elementsBackground[element.id].tint = pixiColors[element.color];
            }
            const renderX = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            const renderY = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;

            if (
                element.type === 'USER_MAIN'
                &&
                (element.lastX !== parseInt(renderX) || element.lastY !== parseInt(renderY))
            ) {
                if (element.lastX !== undefined && element.lastY !== undefined) {
                    const x1 = parseInt(`${element.lastX}`);
                    const y1 = parseInt(`${element.lastY}`);
                    const x2 = parseInt(renderX);
                    const y2 = parseInt(renderY);

                    const direction = getDirection(x1, y1, x2, y2);
                    console.log('getDirection', element.type, direction);

                    if (direction === 'East'
                        || direction === 'South East'
                        || direction === 'North East') {
                        elementsEyesLeft[element.id].visible = false;
                        elementsEyesRight[element.id].visible = true;
                    }

                    if (direction === 'West'
                        || direction === 'South West'
                        || direction === 'North West') {
                        elementsEyesRight[element.id].visible = false;
                        elementsEyesLeft[element.id].visible = true;
                    }

                    if (direction === 'North') {
                        elementsEyesRight[element.id].visible = false;
                        elementsEyesLeft[element.id].visible = false;
                    }

                    if (direction === 'South') {
                        elementsEyesRight[element.id].visible = true;
                        elementsEyesLeft[element.id].visible = true;
                    }

                }
                element.lastX = parseInt(`${renderX}`);
                element.lastY = parseInt(`${renderY}`);
            }

            elementsContainer[element.id].x = renderX;
            elementsContainer[element.id].y = renderY;

            if (element.animation) animations[element.animation].loop(element);
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const gen = () => {
            return {
                init: function (options) {
                    this.id = options.id ? options.id : id();
                    this.x = options.x !== undefined ? options.x : random(minRangeMap, maxRangeMap);
                    this.y = options.y !== undefined ? options.y : random(minRangeMap, maxRangeMap);
                    this.container = options.container;
                    this.type = options.type;
                    this.delayVelPath = 0;
                    this.vel = 0.1;
                    this.dim = 2; // 3; // 1.5
                    this.color = options.color ? options.color : 'red';
                    this.path = [];
                    this.borderRadius = 100;
                    this.clearsIntervals = [];
                    switch (this.type) {
                        case 'BUILDING':
                            this.borderRadius = 0;
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const BUILDING_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BUILDING_getAvailablePosition.x;
                                this.y = BUILDING_getAvailablePosition.y;
                            }
                            this.color = 'black';
                            break;
                        case 'USER_MAIN':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const USER_MAIN_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = USER_MAIN_getAvailablePosition.x;
                                this.y = USER_MAIN_getAvailablePosition.y;
                            }
                            this.color = 'yellow';
                            this.animation = 'random-circle-color';
                            this.animationFrame = 0;
                            break;
                        case 'BOT':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const BOT_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BOT_getAvailablePosition.x;
                                this.y = BOT_getAvailablePosition.y;
                            }
                            this.color = 'electric green';
                            break;
                        case 'BOT_BUG':
                            this.x = maxRangeMap;
                            this.y = minRangeMap;
                            break;
                        case 'BULLET':
                            setTimeout(() => {
                                removeElement(this.id);
                            }, 2000);


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
                            this.ArrowLeft = startListenKey({
                                key: 'ArrowLeft',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.x = validatePosition(this, 'x', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowLeft');
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.x = validatePosition(this, 'x', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowRight');
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.y = validatePosition(this, 'y', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowUp');
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.y = validatePosition(this, 'y', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowDown');

                            const qKeys = ['q', 'Q'];
                            qKeys.map(qKey => {

                                this[`key_${qKey}`] = startListenKey({
                                    key: qKey,
                                    vel: timeIntervalGame,
                                    onKey: () => {
                                        console.log('onKey', this.id);
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET',
                                            container: containerID,
                                            x: this.x + (this.dim * 2),
                                            y: this.y
                                        }));
                                    }
                                });
                                this.clearsIntervals.push(`key_${qKey}`);

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
                                if (this.path.length === 0) {
                                    // search solid snail -> auto generate click mov
                                    // snail inverse -> pathfinding with snail normal
                                }
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
                            const velBotBug = 1;
                            this.x = validatePosition(this, 'x',
                                pos => random(0, 1) === 0 ? pos + velBotBug : pos - velBotBug);
                            this.y = validatePosition(this, 'y',
                                pos => random(0, 1) === 0 ? pos + velBotBug : pos - velBotBug);

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

        const INSTANCE_GENERATOR = () => {

            removeAllElements();

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
            // mobile friendly
            elements = elements.concat(
                [
                    gen().init({
                        container: containerID,
                        type: 'BUILDING',
                        matrix: { x: 2, y: 2 },
                        x: 0,
                        y: 0
                    }),
                    gen().init({
                        container: containerID,
                        type: 'USER_MAIN',
                        // x: 2,
                        // y: 2
                        matrix: { x: 1, y: 2 }
                    }),
                    // gen().init({
                    //     container: containerID,
                    //     type: 'BOT'
                    // }),
                    gen().init({
                        container: containerID,
                        type: 'BOT_BUG'
                    }),
                    gen().init({
                        container: containerID,
                        color: 'safety orange'
                    }),
                ]
            );

            console.log('elements', elements);


        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        setTimeout(() => {
            PIXI_INIT();
            disableOptionsClick(pixiContainerId, ['drag', 'menu', 'select']);
            INSTANCE_GENERATOR();

            s(`.${newInstanceBtn}`).onclick = () =>
                INSTANCE_GENERATOR();

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
            <div class='in container' style='text-align: center'>
                    <button class='inl ${newInstanceBtn}'>${renderLang({ es: 'generar nueva instancia', en: 'new instance' })}</button>
            </div>
        
        `
    },
    renderHtmlPixiLayer: function () {
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
    },
    routerDisplay: function (options) {
        this.renderHtmlPixiLayer();
    }
};