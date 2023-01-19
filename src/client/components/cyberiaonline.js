

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
        this.barHeight = 50;
        const dimData = this.dimStateController();
        const minRangeMap = 0;
        const maxRangeMap = 32;
        const pixiAmplitudeFactor = dimData.minValue / maxRangeMap;
        const timeIntervalGame = 1;
        const newInstanceBtn = id();
        this.windowGameId = id();
        this.windowGameZindex = 999;
        this.coinHtmlIndicatorContainer = id();
        const homeBtnId = id();
        this.windowGamePanel = id();
        let framesCount = -1;



        this.inFullScreenBtn = id();
        this.outFullScreenBtn = id();

        let baseMatrix = [[]];
        let maxBots = 0;


        const mainUserId = id();
        const getMainUserElement = () =>
            elements.find(element => element.id === mainUserId);

        // generate seed world type instance
        // backup elements state (memento)

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

        const getTargetRange = (targetRange) => {
            // 8 * 1 + 8 * 2 + 8 * 3;
            let totalRange = 0;
            range(1, targetRange).map(x => {
                totalRange = totalRange + (x * 8);
            });
            return totalRange;
        };

        const getAvailablePosition = (elementClient, elementsCollisions) => {

            let x, y, type, elementsSearch, maxSnailSteps;
            let autoTargetCondition = false;

            if (elementsCollisions.x !== undefined && elementsCollisions.y !== undefined) {
                type = 'snail';
                x = parseInt(`${elementsCollisions.x}`);
                y = parseInt(`${elementsCollisions.y}`);
                if (elementsCollisions.elementsSearch !== undefined && elementsCollisions.maxSnailSteps !== undefined) {
                    elementsSearch = newInstance(elementsCollisions.elementsSearch);
                    maxSnailSteps = newInstance(elementsCollisions.maxSnailSteps);
                    autoTargetCondition = true;
                }
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

                    let searchCondition;
                    let countSteps = 0;
                    const elementsTarget = [];

                    if (autoTargetCondition)
                        searchCondition = () => countSteps < maxSnailSteps;
                    else
                        searchCondition = () => matrixAux[y][x] !== 0;


                    while (searchCondition()) {
                        currentChange++;
                        countSteps++;
                        if (sum) {
                            // console.log('snail', `${xTarget ? 'x' : 'y'}`, `+`, `${currentChange}/${valueChange}`);
                            if (xTarget) x = x + 1;
                            else y = y + 1;
                        } else {
                            // console.log('snail', `${xTarget ? 'x' : 'y'}`, `-`, `${currentChange}/${valueChange}`);
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
                        if (autoTargetCondition) {
                            elements.map(element => {
                                if (
                                    parseInt(element.x) === parseInt(x)
                                    && parseInt(element.y) === parseInt(y)
                                    && elementsSearch.includes(element.type)
                                    && !elementsTarget.find(x => x.id === element.id)
                                ) {
                                    elementsTarget.push({
                                        id: element.id,
                                        x,
                                        y,
                                        aggro: element.aggro
                                    });
                                }
                            });
                        }
                        if (!matrixAux[y]) {
                            matrixAux[y] = [];
                        }
                        if (matrixAux[y][x] === 0
                            &&
                            generatePath(elementClient, x === maxRangeMap ? x - 1 : x, y === maxRangeMap ? y - 1 : y).length === 0) {
                            matrixAux[y][x] = 1;
                        }
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
            return finder.findPath(parseInt(element.x), parseInt(element.y), newX !== undefined ? newX : x, newY !== undefined ? newY : y, grid);
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

        const renderPosition = (cord, element) =>
            element[cord] * (cyberiaonline.canvasDim / maxRangeMap) - (element.dim * pixiAmplitudeFactor);

        const setShoot = (element, config, fn) => {
            element.validateShoot[config.name] = true;
            element.shootTimeInterval[config.name] = config.shootTimeInterval;
            element.shoot[config.name] = () => {
                if (element.validateShoot[config.name]) {
                    element.validateShoot[config.name] = false;
                    setTimeout(() => {
                        element.validateShoot[config.name] = true;
                    }, element.shootTimeInterval[config.name]);
                    fn();
                }
            };
        };

        const randomIndicatorPosition = () => [0.95, 1.05, 1][random(0, 2)];


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        // https://pixijs.io/examples
        // https://pixijs.download/release/docs/index.html
        // https://www.w3schools.com/colors/colors_picker.asp

        const pixiContainerId = id();
        this.app = new PIXI.Application({ width: maxRangeMap * pixiAmplitudeFactor, height: maxRangeMap * pixiAmplitudeFactor, background: 'gray' });
        const container = new PIXI.Container(); // create container
        this.htmlPixiLayer = id();
        this.htmlPixiFontLayer = id();

        const iteratePixiColors = newInstance(colors);
        const pixiColors = {};
        iteratePixiColors.map(dataColor => {
            pixiColors[dataColor.name.toLowerCase()] = numberHexColor(dataColor.hex);
        });

        const getRandomPixiColor = () => pixiColors[Object.keys(pixiColors)[random(0, (Object.keys(pixiColors).length - 1))]];

        console.log('COLORS', colors);

        const PIXI_INIT = () => {


            // https://pixijs.download/dev/docs/PIXI.AnimatedSprite.html
            // /assets/apps/cyberiaonline/clases


            s(pixiContainerId).appendChild(this.app.view);
            this.app.stage.addChild(container); // container to pixi app
            container.x = 0;
            container.y = 0;
            container.width = maxRangeMap * pixiAmplitudeFactor;
            container.height = maxRangeMap * pixiAmplitudeFactor;

            append(pixiContainerId, /*html*/`
                <style class='${this.htmlPixiLayer}'></style>

                <style class='${this.htmlPixiFontLayer}'></style>

                <${this.htmlPixiFontLayer} class='abs'> </${this.htmlPixiFontLayer}>

                <${this.htmlPixiLayer} class='abs canvas-cursor'>
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




        /*
            container -> module
            
            const component = {
                functions: {},
                elements: {},
                data: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) { }
            }

        */

        const COMPONENTS = {
            'coin-indicator': {
                functions: {},
                elements: {},
                data: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element, value) {
                    const fontEffectId = id();
                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <span class='abs ${fontEffectId}' style='
                            top: ${((element.y * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            left: ${((element.x * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            color: yellow;
                            font-family: retro;
                            /* border: 2px solid magenta; */
                            '>+ $${round10(value, -2)}</span>
                    `);
                    setTimeout(() => {
                        s(`.${fontEffectId}`).remove();
                    }, 1000);
                },
                delete: function (element) { }
            },
            'heal-indicator': {
                functions: {},
                elements: {},
                data: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element, value) {
                    const fontEffectId = id();
                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <span class='abs ${fontEffectId}' style='
                            top: ${((element.y * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            left: ${((element.x * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            color: green;
                            font-family: retro;
                            /* border: 2px solid magenta; */
                            '>+ ${round10(value, -2)}</span>
                    `);
                    setTimeout(() => {
                        s(`.${fontEffectId}`).remove();
                    }, 1000);
                },
                delete: function (element) { }
            },
            'damage-indicator': {
                functions: {},
                elements: {},
                data: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element, value) {
                    const fontEffectId = id();
                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <span class='abs ${fontEffectId}' style='
                            top: ${((element.y * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            left: ${((element.x * cyberiaonline.canvasDim) / maxRangeMap) * randomIndicatorPosition()}px;
                            color: red;
                            font-family: retro;
                            /* border: 2px solid magenta; */
                            '>- ${round10(value, -2)}</span>
                    `);
                    setTimeout(() => {
                        s(`.${fontEffectId}`).remove();
                    }, 1000);
                },
                delete: function (element) { }
            },
            'display-id': {
                functions: {},
                elements: {},
                data: {
                    id: {}
                },
                init: function (element) {

                    this.data.id[element.id] = 'display-id-' + element.id;

                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <div class='abs ${this.data.id[element.id]}' style='
                            top: ${renderPosition('y', element)}px;
                            left: ${renderPosition('x', element)}px;
                            color: ${colors.find(x => x.name.toLowerCase() === element.color).hex};
                            font-family: retro;
                            font-size: 10px;
                            width: ${element.dim * pixiAmplitudeFactor * 2}px;
                            /* border: 2px solid red; */
                            text-align: center;
                            '>${element.id}</div>
                    `);

                },
                loop: function (element) {
                    if (s(`.${this.data.id[element.id]}`)) {
                        s(`.${this.data.id[element.id]}`).style.top =
                            `${renderPosition('y', element)}px`;
                        s(`.${this.data.id[element.id]}`).style.left =
                            `${renderPosition('x', element)}px`;
                    } else {
                        console.error('!s(`.${this.data.id[element.id]}`)');
                    }
                },
                event: function (element) { },
                delete: function (element) {
                    s(`.${this.data.id[element.id]}`).remove();
                    delete this.data.id[element.id];
                }
            },
            'bar-life': {
                functions: {},
                elements: {
                    bar: {}
                },
                data: {},
                init: function (element) {


                    this.elements.bar[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.bar[element.id].tint = pixiColors['electric green'];
                    this.elements.bar[element.id].width = element.dim * pixiAmplitudeFactor;
                    this.elements.bar[element.id].height = element.dim * pixiAmplitudeFactor * 0.2;
                    this.elements.bar[element.id].x = 0;
                    this.elements.bar[element.id].y = -1 * element.dim * pixiAmplitudeFactor * 0.2;
                    elementsContainer[element.id].addChild(this.elements.bar[element.id]);


                },
                loop: function (element) { },
                event: function (element) {
                    if (element.life < 0) element.life = 0;
                    if (element.life > element.maxLife) element.life = newInstance(element.maxLife);
                    const factorLife = element.life / element.maxLife;
                    // console.error('factorLife', factorLife);
                    this.elements.bar[element.id].width = element.dim * pixiAmplitudeFactor * factorLife;
                    if (element.life === 0) {
                        const typeElement = `${element.type}`;
                        setTimeout(() => {
                            switch (typeElement) {
                                case 'BOT':
                                    if (elements.filter(x => x.type === 'BOT').length < maxBots)
                                        elements.push(gen().init({
                                            type: 'BOT'
                                        }));
                                    break;
                                case 'USER_MAIN':
                                    if (elements.filter(x => x.type === 'USER_MAIN').length === 0)
                                        elements.push(gen().init({
                                            type: 'USER_MAIN',
                                            id: mainUserId
                                            // x: 2,
                                            // y: 2
                                            // matrix: { x: 1, y: 2 }
                                        }));
                                    break;
                                default:
                                    break;
                            }
                        }, element.deadDelay);
                        removeElement(element);
                    }
                },
                delete: function (element) {
                    delete this.elements.bar[element.id];
                }
            },
            'random-head-common': {
                data: {
                    color: null,
                    width: null,
                    height: null,
                    eyeColor: null,
                    eyeWidth: null,
                    eyeHeight: null
                },
                elements: {
                    head: {},
                    eyesLeft: {},
                    eyesRight: {}
                },
                init: function (element) {

                    if (this.data.color === null) this.data.color = getRandomPixiColor();
                    if (this.data.width === null) this.data.width = ((element.dim) * pixiAmplitudeFactor) * (100 / random(150, 300));
                    if (this.data.height === null) this.data.height = ((element.dim) * pixiAmplitudeFactor) * (100 / random(150, 300));

                    this.elements.head[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.head[element.id].tint = this.data.color;
                    this.elements.head[element.id].width = this.data.width;
                    this.elements.head[element.id].height = this.data.height;
                    this.elements.head[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.data.width) / 2;
                    this.elements.head[element.id].y = 0;
                    elementsContainer[element.id].addChild(this.elements.head[element.id]);

                    if (this.data.eyeWidth === null) this.data.eyeWidth = ((element.dim) * pixiAmplitudeFactor) * (100 / random(250, 600));
                    if (this.data.eyeHeight === null) this.data.eyeHeight = ((element.dim) * pixiAmplitudeFactor) * (100 / random(250, 600));
                    if (this.data.eyeColor === null) this.data.eyeColor = getRandomPixiColor();

                    this.elements.eyesLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.eyesLeft[element.id].tint = this.data.eyeColor;
                    this.elements.eyesLeft[element.id].width = this.data.eyeWidth;
                    this.elements.eyesLeft[element.id].height = this.data.eyeHeight;
                    this.elements.eyesLeft[element.id].x = (((element.dim) * pixiAmplitudeFactor) / 2) - (this.data.eyeWidth / 2); /// - [this.data.eyeWidth, 0][random(0, 1)];
                    this.elements.eyesLeft[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.eyesLeft[element.id]);

                    this.elements.eyesRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.eyesRight[element.id].tint = this.data.eyeColor;
                    this.elements.eyesRight[element.id].width = this.data.eyeWidth;
                    this.elements.eyesRight[element.id].height = this.data.eyeHeight;
                    this.elements.eyesRight[element.id].x = (((element.dim) * pixiAmplitudeFactor) / 2) - (this.data.eyeWidth / 2); /// + [this.data.eyeWidth, 0][random(0, 1)];
                    this.elements.eyesRight[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.eyesRight[element.id]);

                },
                loop: function (element) {
                    let direction = element.direction;
                    if (direction === 'East'
                        || direction === 'South East'
                        || direction === 'North East') {
                        this.elements.eyesLeft[element.id].visible = false;
                        this.elements.eyesRight[element.id].visible = true;
                    }

                    if (direction === 'West'
                        || direction === 'South West'
                        || direction === 'North West') {
                        this.elements.eyesRight[element.id].visible = false;
                        this.elements.eyesLeft[element.id].visible = true;
                    }

                    if (direction === 'North') {
                        this.elements.eyesRight[element.id].visible = false;
                        this.elements.eyesLeft[element.id].visible = false;
                    }

                    if (direction === 'South') {
                        this.elements.eyesRight[element.id].visible = true;
                        this.elements.eyesLeft[element.id].visible = true;
                    }

                },
                event: function (element) { },
                delete: function (element) {
                    delete this.elements.head[element.id];
                    delete this.elements.eyesLeft[element.id];
                    delete this.elements.eyesRight[element.id];
                    // respawn random params
                    this.data.color = null;
                    this.data.width = null;
                    this.data.height = null;
                    this.data.eyeColor = null;
                    this.data.eyeWidth = null;
                    this.data.eyeHeight = null;
                }
            },
            'texture|zinnwaldite brown|cafe noir': {
                functions: {},
                elements: {
                    layer1: {},
                    layer2: {}
                },
                data: {},
                init: function (element) {
                    this.elements.layer1[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.layer1[element.id].tint = pixiColors['zinnwaldite brown'];
                    this.elements.layer1[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 1.1;
                    this.elements.layer1[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 1.1;
                    this.elements.layer1[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.elements.layer1[element.id].width) / 2;
                    this.elements.layer1[element.id].y = (((element.dim) * pixiAmplitudeFactor) - this.elements.layer1[element.id].height) / 2;
                    elementsContainer[element.id].addChild(this.elements.layer1[element.id]);

                    this.elements.layer2[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.layer2[element.id].tint = pixiColors['cafe noir'];
                    this.elements.layer2[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 1.5;
                    this.elements.layer2[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 1.5;
                    this.elements.layer2[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.elements.layer2[element.id].width) / 2;
                    this.elements.layer2[element.id].y = (((element.dim) * pixiAmplitudeFactor) - this.elements.layer2[element.id].height) / 2;
                    elementsContainer[element.id].addChild(this.elements.layer2[element.id]);
                },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) {
                    delete this.elements.layer1[element.id];
                    delete this.elements.layer2[element.id];
                }
            },
            'background-circle': {
                functions: {
                    alertCollision: element => {
                        return (
                            element.type !== 'BUILDING'
                            && element.type !== 'FLOOR'
                            && element.type !== 'TOUCH'
                        ) &&

                            elements.filter(x => (

                                validateCollision(x, element)
                                &&
                                element.id !== x.id
                                &&
                                x.type !== 'FLOOR'
                                &&
                                x.type !== 'TOUCH'
                            )).length > 0;
                    }
                },
                elements: {
                    circle: {}
                },
                data: {
                    radioPor: 0.9,
                    collisionColor: {}
                },
                init: function (element) {

                    this.data.collisionColor[element.id] = true;

                    this.elements.circle[element.id] = new PIXI.Graphics();
                    this.elements.circle[element.id].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[element.id].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[element.id].beginFill(pixiColors['black']);
                    this.elements.circle[element.id].lineStyle(0);
                    this.elements.circle[element.id].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * this.data.radioPor * 0.5
                    ); // x,y,radio
                    this.elements.circle[element.id].endFill();

                    elementsContainer[element.id].addChild(this.elements.circle[element.id]);

                    switch (element.type) {
                        case 'USER_MAIN':
                            this.elements.circle[element.id].visible = false;
                            break;
                        case 'TOUCH':
                            this.elements.circle[element.id].visible = false;
                            break;
                        case 'BOT':
                            this.elements.circle[element.id].visible = false;
                            break;
                        default:
                    };


                },
                loop: function (element) {
                    if (this.functions.alertCollision(element) && this.data.collisionColor[element.id] === true) {
                        this.data.collisionColor[element.id] = false;
                        this.elements.circle[element.id].clear();
                        this.elements.circle[element.id].beginFill(pixiColors['magenta']);
                        this.elements.circle[element.id].lineStyle(0);
                        this.elements.circle[element.id].drawCircle(
                            (element.dim * pixiAmplitudeFactor) * 0.5,
                            (element.dim * pixiAmplitudeFactor) * 0.5,
                            (element.dim * pixiAmplitudeFactor) * this.data.radioPor * 0.5
                        ); // x,y,radio
                        this.elements.circle[element.id].endFill();
                        setTimeout(() => {
                            if (!this.elements.circle[element.id]) return;
                            setTimeout(() => {
                                if (!this.elements.circle[element.id]) return;
                                this.data.collisionColor[element.id] = true;
                            }, 500);
                            this.elements.circle[element.id].clear();
                            this.elements.circle[element.id].beginFill(pixiColors['black']);
                            this.elements.circle[element.id].lineStyle(0);
                            this.elements.circle[element.id].drawCircle(
                                (element.dim * pixiAmplitudeFactor) * 0.5,
                                (element.dim * pixiAmplitudeFactor) * 0.5,
                                (element.dim * pixiAmplitudeFactor) * this.data.radioPor * 0.5
                            ); // x,y,radio
                            this.elements.circle[element.id].endFill();
                        }, 500);
                    }
                },
                event: function (element) {


                },
                delete: function (element) {
                    delete this.elements.circle[element.id];
                }
            },
            'background': {
                functions: {
                    alertCollision: element => {
                        return (
                            element.type !== 'BUILDING'
                            && element.type !== 'FLOOR'
                            && element.type !== 'TOUCH'
                        ) &&

                            elements.filter(x => (

                                validateCollision(x, element)
                                &&
                                element.id !== x.id
                                &&
                                x.type !== 'FLOOR'
                                &&
                                x.type !== 'TOUCH'
                            )).length > 0;
                    }
                },
                elements: {
                    background: {},
                },
                init: function (element) {

                    this.elements.background[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.background[element.id].x = 0;
                    this.elements.background[element.id].y = 0;
                    this.elements.background[element.id].width = (element.dim) * pixiAmplitudeFactor;
                    this.elements.background[element.id].height = (element.dim) * pixiAmplitudeFactor;
                    this.elements.background[element.id].tint = pixiColors[element.color];
                    elementsContainer[element.id].addChild(this.elements.background[element.id]);

                    switch (element.type) {
                        case 'USER_MAIN':
                            this.elements.background[element.id].visible = false;
                            break;
                        case 'TOUCH':
                            this.elements.background[element.id].visible = false;
                            break;
                        case 'BOT':
                            this.elements.background[element.id].visible = false;
                            break;
                        default:
                    };


                },
                loop: function (element) {
                    if (this.functions.alertCollision(element)) {
                        this.elements.background[element.id].tint = pixiColors['magenta'];
                    } else if (this.elements.background[element.id].tint !== pixiColors[element.color]) {
                        this.elements.background[element.id].tint = pixiColors[element.color];
                    }
                },
                event: function (element) {


                },
                delete: function (element) {
                    delete this.elements.background[element.id];
                }
            },
            'anon-foots': {
                elements: {
                    footLeft: {},
                    footRight: {}
                },
                data: {
                    foot: {}
                },
                init: function (element) {


                    this.data.foot[element.id] = 0;

                    this.elements.footLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.footLeft[element.id].tint = pixiColors['white'];
                    this.elements.footLeft[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                    this.elements.footLeft[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 3.25;
                    this.elements.footLeft[element.id].y = element.dim * 0.8 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.footLeft[element.id]);

                    this.elements.footRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.footRight[element.id].tint = pixiColors['white'];
                    this.elements.footRight[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                    this.elements.footRight[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 1.75;
                    this.elements.footRight[element.id].y = element.dim * 0.8 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.footRight[element.id]);
                },
                loop: function (element) {
                    if ((element.lastX !== parseInt(element.renderX) || element.lastY !== parseInt(element.renderY))) {
                        let direction = element.direction;

                        switch (this.data.foot[element.id]) {
                            case 0:
                                this.elements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) * (direction === 'South' || direction === 'North' ? 0 : (1 / 10));
                                this.elements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                break;
                            case 50:
                                this.elements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                this.elements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) * (direction === 'South' || direction === 'North' ? 0 : (1 / 10));
                                break;
                            case 100:
                                this.data.foot[element.id] = -1;
                                break;
                        }
                        this.data.foot[element.id]++;
                    } else {
                        const currentElement = newInstance(element);
                        setTimeout(() => {
                            if (element.lastX === parseInt(currentElement.renderX) && element.lastY === parseInt(currentElement.renderY) && elementsContainer[element.id]) {
                                this.elements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                this.elements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                            }
                        }, 100);
                    }

                },
                event: function (element) { },
                delete: function (element) {
                    delete this.data.foot[element.id];
                    delete this.elements.footLeft[element.id];
                    delete this.elements.footRight[element.id];
                }
            },
            'anon-head': {
                elements: {
                    head: {},
                    eyesLeft: {},
                    eyesRight: {}
                },
                init: function (element) {

                    this.elements.head[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.head[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 2;
                    this.elements.head[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 2;
                    this.elements.head[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 4;
                    this.elements.head[element.id].y = 0;
                    elementsContainer[element.id].addChild(this.elements.head[element.id]);

                    this.elements.eyesLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.eyesLeft[element.id].tint = pixiColors['blue'];
                    this.elements.eyesLeft[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.eyesLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.eyesLeft[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 3.25;
                    this.elements.eyesLeft[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.eyesLeft[element.id]);

                    this.elements.eyesRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.elements.eyesRight[element.id].tint = pixiColors['blue'];
                    this.elements.eyesRight[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.eyesRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.elements.eyesRight[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 1.75;
                    this.elements.eyesRight[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.elements.eyesRight[element.id]);


                },
                loop: function (element) {
                    let direction = element.direction;
                    if (direction === 'East'
                        || direction === 'South East'
                        || direction === 'North East') {
                        this.elements.eyesLeft[element.id].visible = false;
                        this.elements.eyesRight[element.id].visible = true;
                    }

                    if (direction === 'West'
                        || direction === 'South West'
                        || direction === 'North West') {
                        this.elements.eyesRight[element.id].visible = false;
                        this.elements.eyesLeft[element.id].visible = true;
                    }

                    if (direction === 'North') {
                        this.elements.eyesRight[element.id].visible = false;
                        this.elements.eyesLeft[element.id].visible = false;
                    }

                    if (direction === 'South') {
                        this.elements.eyesRight[element.id].visible = true;
                        this.elements.eyesLeft[element.id].visible = true;
                    }

                },
                event: function (element) {

                },
                delete: function (element) {
                    delete this.elements.head[element.id];
                    delete this.elements.eyesLeft[element.id];
                    delete this.elements.eyesRight[element.id];
                }
            },
            'BULLET-THREE-RANDOM-CIRCLE-COLOR': {
                //      X
                // >  X
                //      X
                functions: {
                    alertCollision: (element, fromArray, toArray) =>
                        elements.filter(x => {



                            // console.error(fromArray, element.type, x.type);

                            // if (fromArray.includes(element.type) &&
                            //     toArray.includes(x.type)) {
                            //     console.error('--', fromArray.includes(element.type));
                            //     console.error('--', validateCollision(x, element));
                            //     console.error('--', element.id !== x.id);
                            //     console.error('--', toArray.includes(x.type));
                            //     console.error(x, element);
                            // }
                            return (
                                fromArray.includes(element.type)
                                &&
                                validateCollision(x, element)
                                &&
                                element.id !== x.id
                                &&
                                toArray.includes(x.type)
                                &&
                                element.parent.id !== x.id
                                &&
                                element.parent.type !== x.type
                            );

                        }),
                    setShoot: element => setShoot(element, {
                        name: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                        shootTimeInterval: element.type === 'BOT' ? 1500 : 700
                    }, () => {

                        let direction = element.direction;
                        const dimFactor = 1.5;


                        if (element.alternate === undefined) element.alternate = true;

                        if (element.alternate) {

                            const distanceFactor = 1.3;
                            element.alternate = false;

                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x,
                                y: element.y - element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x,
                                y: element.y + element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * distanceFactor,
                                y: element.y,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * distanceFactor,
                                y: element.y,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));

                        } else {


                            const distanceFactor = 1.1;
                            element.alternate = true;

                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * distanceFactor,
                                y: element.y - element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * distanceFactor,
                                y: element.y + element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * distanceFactor,
                                y: element.y + element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * distanceFactor,
                                y: element.y - element.dim * distanceFactor,
                                direction: element.direction,
                                parent: element,
                                dim: element.dim * dimFactor
                            }));

                        }
                        return;

                        if (direction === 'East'
                            || direction === 'South East'
                            || direction === 'North East') {

                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * dimFactor,
                                y: element.y - element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * dimFactor,
                                y: element.y + element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * dimFactor * midFactor,
                                y: element.y,
                                direction: element.direction,
                                parent: element
                            }));

                        }

                        if (direction === 'West'
                            || direction === 'South West'
                            || direction === 'North West') {
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * dimFactor,
                                y: element.y - element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * dimFactor,
                                y: element.y + element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * dimFactor * midFactor,
                                y: element.y,
                                direction: element.direction,
                                parent: element
                            }));

                        }

                        if (direction === 'North') {

                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * dimFactor,
                                y: element.y - element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * dimFactor,
                                y: element.y - element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x,
                                y: element.y - element.dim * dimFactor * midFactor,
                                direction: element.direction,
                                parent: element
                            }));

                        }

                        if (direction === 'South') {

                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x - element.dim * dimFactor,
                                y: element.y + element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x + element.dim * dimFactor,
                                y: element.y + element.dim * dimFactor,
                                direction: element.direction,
                                parent: element
                            }));
                            elements.push(gen().init({
                                id: id(),
                                type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                color: 'dark red',
                                x: element.x,
                                y: element.y + element.dim * dimFactor * midFactor,
                                direction: element.direction,
                                parent: element
                            }));
                        }

                    })
                },
                elements: {},
                data: {
                    value: 40 / 12,
                    vel: 2500,
                    validateShoot: {}
                },
                init: function (element) {
                    this.data.validateShoot[element.id] = true;
                },
                loop: function (element) {
                    const participantsFrom = ['BULLET-THREE-RANDOM-CIRCLE-COLOR'];
                    const participantsTo = ['BOT', 'USER_MAIN'];
                    const collisionTest =
                        this.functions.alertCollision(element, participantsFrom, participantsTo)
                    if (this.data.validateShoot[element.id] === true && collisionTest.length > 0) {

                        this.data.validateShoot[element.id] = false;
                        setTimeout(() => {
                            this.data.validateShoot[element.id] = true;
                        }, this.data.vel);


                        // console.error(this.functions.alertCollision(element, participantsFrom, participantsTo));


                        collisionTest.map(elementConllision => {
                            elementConllision.life = elementConllision.life - this.data.value;
                            if (elementConllision.type === 'BOT'
                                && element.parent.type === 'USER_MAIN'
                                && elementConllision.life <= 0
                                && !element.parent.idsAfterBotDrops.includes(elementConllision.id)) {
                                element.parent.coin = element.parent.coin + 10;
                                element.parent.idsAfterBotDrops.push(elementConllision.id);
                            };
                            // console.error(element.life);
                        });
                    }
                },
                event: function (element) { },
                delete: function (element) { }
            },
            'BULLET-HEAL': {
                functions: {
                    alertCollision: (element) =>
                        elements.filter(x => {



                            // console.error(fromArray, element.type, x.type);

                            // if (fromArray.includes(element.type) &&
                            //     toArray.includes(x.type)) {
                            //     console.error('--', fromArray.includes(element.type));
                            //     console.error('--', validateCollision(x, element));
                            //     console.error('--', element.id !== x.id);
                            //     console.error('--', toArray.includes(x.type));
                            //     console.error(x, element);
                            // }
                            return (
                                validateCollision(x, element)
                                &&
                                element.parent.id === x.id
                            );

                        }),
                    setShoot: element => setShoot(element, {
                        name: 'BULLET-HEAL',
                        shootTimeInterval: 500
                    }, () => {

                        elements.push(gen().init({
                            id: id(),
                            type: 'BULLET-HEAL',
                            color: 'dark green',
                            x: element.x,
                            y: element.y,
                            parent: element
                        }));

                    })
                },
                elements: {},
                data: {
                    value: 5,
                    vel: 2500,
                    validateShoot: {}
                },
                init: function (element) {
                    this.data.validateShoot[element.id] = true;
                },
                loop: function (element) {
                    const collisionTest =
                        this.functions.alertCollision(element)
                    if (this.data.validateShoot[element.id] === true && collisionTest.length > 0) {

                        this.data.validateShoot[element.id] = false;
                        setTimeout(() => {
                            this.data.validateShoot[element.id] = true;
                        }, this.data.vel);


                        // console.error(this.functions.alertCollision(element, participantsFrom, participantsTo));


                        collisionTest.map(element => {

                            element.life = element.life + this.data.value;

                        });
                    }
                },
                event: function (element) { },
                delete: function (element) { }
            },
            'BULLET-CROSS': {
                functions: {
                    setShoot: element => setShoot(element, {
                        name: 'BULLET-CROSS',
                        shootTimeInterval: 500
                    }, () => {
                        let xBullet = 0;
                        let yBullet = 0;
                        let direction = element.direction;

                        if (direction === 'East'
                            || direction === 'South East'
                            || direction === 'North East') {
                            xBullet = element.dim * 2;
                        }

                        if (direction === 'West'
                            || direction === 'South West'
                            || direction === 'North West') {
                            xBullet = element.dim * -2;
                        }

                        if (direction === 'North') {
                            yBullet = element.dim * -2;
                        }

                        if (direction === 'South') {
                            yBullet = element.dim * 2;
                        }

                        elements.push(gen().init({
                            id: id(),
                            type: 'BULLET-CROSS',
                            color: 'dark red',
                            x: element.x + xBullet,
                            y: element.y + yBullet
                        }));
                    })
                },
                elements: {},
                data: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) { }

            },
            'cross-effect': {
                elements: {
                    sprite: {}
                },
                init: function (element) { },
                loop: function (element) { },
                delete: function (eventHash) {
                    if (!this.elements.sprite[eventHash]) return;
                    this.elements.sprite[eventHash].destroy();
                    delete this.elements.sprite[eventHash];
                },
                event: function (element) {
                    const valueAbsDiff = (element.dim) * pixiAmplitudeFactor / 6;
                    range(0, 4).map(i => {
                        const eventHash = 'x' + s4();
                        this.elements.sprite[eventHash] = new PIXI.Sprite(PIXI.Texture.WHITE);
                        this.elements.sprite[eventHash].width = (element.dim) * pixiAmplitudeFactor / 5;
                        this.elements.sprite[eventHash].height = (element.dim) * pixiAmplitudeFactor / 5;
                        const xyCorrection = (this.elements.sprite[eventHash].width / 2);
                        switch (i) {
                            case 0:
                                this.elements.sprite[eventHash].x = ((element.dim) * pixiAmplitudeFactor / 2) - xyCorrection;
                                this.elements.sprite[eventHash].y = ((element.dim) * pixiAmplitudeFactor / 2) - xyCorrection;
                                break;
                            case 1:
                                this.elements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                this.elements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                break;
                            case 2:
                                this.elements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                this.elements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                break;
                            case 3:
                                this.elements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                this.elements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                break;
                            case 4:
                                this.elements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                this.elements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                break;
                            default:
                                break;
                        }
                        this.elements.sprite[eventHash].tint = pixiColors['red'];
                        elementsContainer[element.id].addChild(this.elements.sprite[eventHash]);
                        setTimeout(() => {
                            this.delete(eventHash);
                        }, 1000);
                    });
                }
            },
            'random-circle-color': {
                data: {
                    circle: {}
                },
                elements: {
                    circle: {}
                },
                init: function (element) {
                    this.elements.circle[element.id] = new PIXI.Graphics();
                    this.elements.circle[element.id].beginFill(randomNumberColor());
                    this.elements.circle[element.id].lineStyle(0);
                    this.elements.circle[element.id].drawCircle(0, 0, 1.5 * pixiAmplitudeFactor); // x,y,radio
                    this.elements.circle[element.id].endFill();
                    this.elements.circle[element.id].width = (element.dim * pixiAmplitudeFactor) / 4;
                    this.elements.circle[element.id].height = (element.dim * pixiAmplitudeFactor) / 4;
                    elementsContainer[element.id].addChild(this.elements.circle[element.id]);
                },
                loop: function (element) {
                    if (!this.data.circle[element.id])
                        this.data.circle[element.id] = 0;
                    switch (this.data.circle[element.id]) {
                        case 0:
                            this.elements.circle[element.id].clear();
                            this.elements.circle[element.id].beginFill(randomNumberColor());
                            this.elements.circle[element.id].lineStyle(0);
                            this.elements.circle[element.id].drawCircle(
                                0,
                                0,
                                2 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.elements.circle[element.id].endFill();
                            break;
                        case 100:
                            this.elements.circle[element.id].clear();
                            this.elements.circle[element.id].beginFill(randomNumberColor());
                            this.elements.circle[element.id].lineStyle(0);
                            this.elements.circle[element.id].drawCircle(
                                0,
                                0,
                                3 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.elements.circle[element.id].endFill();
                            break;
                        case 200:
                            this.elements.circle[element.id].clear();
                            this.elements.circle[element.id].beginFill(randomNumberColor());
                            this.elements.circle[element.id].lineStyle(0);
                            this.elements.circle[element.id].drawCircle(
                                0,
                                0,
                                2 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.elements.circle[element.id].endFill();
                            break;
                        case 300:
                            this.elements.circle[element.id].clear();
                            this.elements.circle[element.id].beginFill(randomNumberColor());
                            this.elements.circle[element.id].lineStyle(0);
                            this.elements.circle[element.id].drawCircle(
                                0,
                                0,
                                1.5 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.elements.circle[element.id].endFill();
                            break;
                        case 400:
                            this.data.circle[element.id] = -1;
                            break;
                    }
                    this.data.circle[element.id]++;
                },
                delete: function (element) {
                    delete this.elements.circle[element.id];
                    delete this.data.circle[element.id];
                }
            },
            'random-circle-color-one-big': {
                elements: {
                    circle: {}
                },
                init: function (element) { },
                loop: function (element) { },
                delete: function (eventHash) {
                    if (!this.elements.circle[eventHash]) return;
                    this.elements.circle[eventHash].destroy();
                    delete this.elements.circle[eventHash];
                },
                event: function (element) {
                    const eventHash = 'x' + s4();
                    const radioPor = 0.5;

                    this.elements.circle[eventHash] = new PIXI.Graphics();
                    this.elements.circle[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[eventHash].beginFill(randomNumberColor());
                    this.elements.circle[eventHash].lineStyle(0);
                    this.elements.circle[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * radioPor * 0.5
                    ); // x,y,radio
                    this.elements.circle[eventHash].endFill();
                    if (elementsContainer[element.id])
                        elementsContainer[element.id].addChild(this.elements.circle[eventHash]);


                    setTimeout(() => {
                        this.delete(eventHash);
                    }, 1000);

                }
            },
            'heal-circle-color-one-big': {
                elements: {
                    circle: {},
                    circle0: {},
                    circle1: {},
                    circle2: {}
                },
                init: function (element) { },
                loop: function (element) { },
                delete: function (eventHash) {
                    if (this.elements.circle[eventHash]) {
                        this.elements.circle[eventHash].destroy();
                        delete this.elements.circle[eventHash];
                    }
                    if (this.elements.circle0[eventHash]) {
                        this.elements.circle0[eventHash].destroy();
                        delete this.elements.circle0[eventHash];
                    }
                    if (this.elements.circle1[eventHash]) {
                        this.elements.circle1[eventHash].destroy();
                        delete this.elements.circle1[eventHash];
                    }
                    if (this.elements.circle2[eventHash]) {
                        this.elements.circle2[eventHash].destroy();
                        delete this.elements.circle2[eventHash];
                    }
                },
                event: function (element) {
                    const eventHash = 'x' + s4();
                    const dimFactor = [0.25, 0.30, 0.35][random(0, 2)];
                    const radioPor = 0.5 * 2 * dimFactor;
                    const xRandomFactor = 1 // [0.75, 0.8, 1, 1.2, 1.25][random(0, 4)];
                    const yRandomFactor = [0.8, 1, 1.2][random(0, 2)];

                    this.elements.circle[eventHash] = new PIXI.Graphics();
                    this.elements.circle[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle[eventHash].beginFill(pixiColors['british racing green']);
                    this.elements.circle[eventHash].lineStyle(0);
                    this.elements.circle[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.2 * xRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * 0.5 * yRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * radioPor * 0.5
                    ); // x,y,radio
                    this.elements.circle[eventHash].endFill();
                    elementsContainer[element.id].addChild(this.elements.circle[eventHash]);

                    const radioPor0 = 0.5 * dimFactor;

                    this.elements.circle0[eventHash] = new PIXI.Graphics();
                    this.elements.circle0[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle0[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle0[eventHash].beginFill(pixiColors['vivid malachite']);
                    this.elements.circle0[eventHash].lineStyle(0);
                    this.elements.circle0[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.2 * xRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * 0.5 * yRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * radioPor0 * 0.5
                    ); // x,y,radio
                    this.elements.circle0[eventHash].endFill();
                    elementsContainer[element.id].addChild(this.elements.circle0[eventHash]);

                    const radioPor1 = 0.5 * 2 * dimFactor;

                    this.elements.circle1[eventHash] = new PIXI.Graphics();
                    this.elements.circle1[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle1[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle1[eventHash].beginFill(pixiColors['british racing green']);
                    this.elements.circle1[eventHash].lineStyle(0);
                    this.elements.circle1[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.8 * xRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * 0.5 * yRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * radioPor1 * 0.5
                    ); // x,y,radio
                    this.elements.circle1[eventHash].endFill();
                    elementsContainer[element.id].addChild(this.elements.circle1[eventHash]);

                    const radioPor2 = 0.5 * dimFactor;

                    this.elements.circle2[eventHash] = new PIXI.Graphics();
                    this.elements.circle2[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle2[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.elements.circle2[eventHash].beginFill(pixiColors['vivid malachite']);
                    this.elements.circle2[eventHash].lineStyle(0);
                    this.elements.circle2[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.8 * xRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * 0.5 * yRandomFactor,
                        (element.dim * pixiAmplitudeFactor) * radioPor2 * 0.5
                    ); // x,y,radio
                    this.elements.circle2[eventHash].endFill();
                    elementsContainer[element.id].addChild(this.elements.circle2[eventHash]);


                    setTimeout(() => {
                        this.delete(eventHash);
                    }, 1000);

                }
            }
        };

        const removeElement = element => {
            if (!elementsContainer[element.id]) return;
            // logDataManage(element);
            if (element.components)
                element.components.map(component =>
                    COMPONENTS[component].delete(element));
            element.clearsIntervals.map(keyInterval => clearInterval(element[keyInterval]));

            elementsContainer[element.id].destroy();
            delete elementsContainer[element.id];
            elements = elements.filter(x => x.id !== element.id);
        };

        const removeAllElements = () => elements.map(element => removeElement(element));

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
            if (element.components) element.components.map(component =>
                COMPONENTS[component].init(element));
        };

        const PIXI_LOOP_ELEMENT = element => {
            if (!elementsContainer[element.id]) {
                // bug pero si esta en elements
                console.error('!elementsContainer[element.id]');
                return;
            };
            element.renderX = (element.x - (element.dim / 2)) * pixiAmplitudeFactor;
            element.renderY = (element.y - (element.dim / 2)) * pixiAmplitudeFactor;
            let direction;
            if ((element.lastX !== parseInt(element.renderX) || element.lastY !== parseInt(element.renderY))) {
                if (element.lastX !== undefined && element.lastY !== undefined) {
                    const x1 = parseInt(`${element.lastX}`);
                    const y1 = parseInt(`${element.lastY}`);
                    const x2 = parseInt(element.renderX);
                    const y2 = parseInt(element.renderY);

                    direction = getDirection(x1, y1, x2, y2);
                    // console.log('getDirection', element.type, direction);
                    element.direction = direction;
                }
            }
            if (element.components) element.components.map(component =>
                COMPONENTS[component].loop(element));
            element.lastX = parseInt(`${element.renderX}`);
            element.lastY = parseInt(`${element.renderY}`);
            elementsContainer[element.id].x = newInstance(element.renderX);
            elementsContainer[element.id].y = newInstance(element.renderY);


            if (element.lastCoin !== undefined) {
                const valueChangeCoin = Math.abs((element.lastCoin - element.coin));
                if (element.lastCoin < element.coin) {
                    COMPONENTS['coin-indicator'].event(element, valueChangeCoin);
                    htmls(`.${this.coinHtmlIndicatorContainer}`, `$${element.coin}`);
                }
            }
            if (element.id === mainUserId) element.lastCoin = newInstance(element.coin);

            // dead container and respawn
            const intervalFrameLifeIndicator = 50;
            if (element.lastLife !== undefined) {
                const valueChangeLife = Math.abs((element.lastLife - element.life));
                if (element.lastLife !== element.life)
                    COMPONENTS['bar-life'].event(element);
                if (element.lastLife > element.life && (framesCount % intervalFrameLifeIndicator === 0))
                    COMPONENTS['damage-indicator'].event(element, valueChangeLife);
                if (element.lastLife < element.life && (framesCount % intervalFrameLifeIndicator === 0))
                    COMPONENTS['heal-indicator'].event(element, valueChangeLife);
                // if (!element) alert();
            }
            if (framesCount % intervalFrameLifeIndicator === 0) element.lastLife = newInstance(element.life);
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const gen = () => {
            return {
                init: function (options) {
                    this.id = options.id ? options.id : id();
                    this.x = options.x !== undefined ? options.x : random(minRangeMap, maxRangeMap);
                    this.y = options.y !== undefined ? options.y : random(minRangeMap, maxRangeMap);
                    this.type = options.type;
                    this.delayVelPath = 0;
                    this.vel = options.vel ? options.vel : 0.1;
                    this.dim = options.dim ? options.dim : 3; // 2 // 3; // 1.5
                    this.coin = 0;
                    this.idsAfterBotDrops = [];
                    this.color = options.color ? options.color : 'red';
                    this.path = [];
                    this.clearsIntervals = [];
                    this.shoot = {};
                    this.shootTimeInterval = {};
                    this.validateShoot = {};
                    this.direction = options.direction !== undefined ? options.direction : 'South';
                    this.components = options.components ? options.components : ['background'];
                    this.deadDelay = 2000;
                    this.maxLife = 100;
                    this.life = 100;
                    this.parent = options.parent ? options.parent : undefined;
                    this.aggro = random(0, 10);
                    this.searchPathRange = maxRangeMap * 0.3;
                    this.searchStopRange = this.searchPathRange * 0.4;
                    this.autoShoot = false;

                    this.autoTargetIntervalCalculate = 1000;
                    this.autoTargetBlockCalculate = true;
                    this.maxSnailSteps = getTargetRange(10);
                    switch (this.type) {
                        case 'BUILDING':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const BUILDING_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BUILDING_getAvailablePosition.x;
                                this.y = BUILDING_getAvailablePosition.y;
                            }
                            this.color = 'black';
                            this.components = this.components.concat(
                                [
                                    'texture|zinnwaldite brown|cafe noir'
                                ]
                            );
                            break;
                        case 'USER_MAIN':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const USER_MAIN_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = USER_MAIN_getAvailablePosition.x;
                                this.y = USER_MAIN_getAvailablePosition.y;
                            }
                            this.color = 'yellow';
                            this.components = this.components.concat(
                                [
                                    'anon-head',
                                    'anon-foots',
                                    'random-circle-color',
                                    'display-id',
                                    'bar-life'
                                ]
                            );
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].functions.setShoot(this);
                            COMPONENTS['BULLET-HEAL'].functions.setShoot(this);
                            this.autoMovementShoot = () => Object.keys(this.shoot).map(btn => {
                                if (this.validateShoot[btn] === true) range(0, 10).map(attemp =>
                                    setTimeout(() => this.shoot[btn](), attemp * 100));
                            });
                            // COMPONENTS['BULLET-CROSS'].functions.setShoot(this);
                            break;
                        case 'BOT':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const BOT_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BOT_getAvailablePosition.x;
                                this.y = BOT_getAvailablePosition.y;
                            }
                            this.color = 'electric green';
                            this.vel = 0.025;
                            this.components = this.components.concat(
                                [
                                    'random-head-common',
                                    'anon-foots',
                                    'display-id',
                                    'bar-life'
                                ]
                            );
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].functions.setShoot(this);

                            // cambiar movimiento al que tenga
                            // mayor agro dentro del rango snail

                            this.autoTarget = () => {
                                if (this.autoTargetBlockCalculate) {
                                    this.autoTargetBlockCalculate = false;
                                    setTimeout(() => {
                                        this.autoTargetBlockCalculate = true;
                                    }, this.autoTargetIntervalCalculate);
                                    let elementTarget;
                                    elements.map(element => {
                                        if (element.type === 'USER_MAIN') {
                                            const targetDistance = getDistance(element.x, element.y, this.x, this.y);
                                            // console.error(
                                            //     'getDistance', targetDistance, this.searchPathRange);
                                            if (
                                                targetDistance <= this.searchPathRange &&
                                                (elementTarget === undefined || elementTarget.aggro < element.aggro)
                                            ) {
                                                const x = parseInt(element.x);
                                                const y = parseInt(element.y);
                                                elementTarget = {
                                                    id: element.id,
                                                    type: element.type,
                                                    x: x === 0 ? 1 : x,
                                                    y: y === 0 ? 1 : y,
                                                    aggro: element.aggro
                                                };
                                            };
                                            // console.error('elementTarget', elementTarget);

                                            if (elementTarget !== undefined) {
                                                this.autoShoot = true;
                                                this.path = generatePath(this, elementTarget.x, elementTarget.y);

                                            } else {
                                                this.autoShoot = false;
                                            }
                                        }
                                    });
                                    // const { x, y } = getAvailablePosition(this,
                                    //     {
                                    //         x: parseInt(this.x),
                                    //         y: parseInt(this.y),
                                    //         elementsCollisions: ['BUILDING'],
                                    //         elementsSearch: ['USER_MAIN'],
                                    //         maxSnailSteps: this.maxSnailSteps
                                    //     }
                                    // );

                                }
                            };
                            break;
                        case 'BOT_BUG':
                            this.x = maxRangeMap;
                            this.y = minRangeMap;
                            break;
                        case 'BULLET-CROSS':
                            this.components = [this.type];
                            setTimeout(() => {
                                COMPONENTS['cross-effect'].event(this);
                            });
                            setTimeout(() => {
                                removeElement(this);
                            }, 2000);
                            break;
                        case 'BULLET-HEAL':
                            this.components = [this.type];
                            setTimeout(() => {
                                COMPONENTS['heal-circle-color-one-big'].event(this);
                            });
                            setTimeout(() => {
                                removeElement(this);
                            }, 400);

                            break;
                        case 'BULLET-THREE-RANDOM-CIRCLE-COLOR':
                            this.components = ['background-circle', this.type];
                            this.dim = this.dim * 0.25;
                            setTimeout(() => {
                                COMPONENTS['random-circle-color-one-big'].event(this);
                            });
                            setTimeout(() => {
                                removeElement(this);
                            }, 500);

                            const midFactor = 1.8;
                            const dimFactor = 0.5;
                            const allTarget = true;

                            if (this.direction !== null) {
                                let direction = this.direction;
                                setTimeout(() => {

                                    if (direction === 'East'
                                        || direction === 'South East'
                                        || direction === 'North East' || allTarget) {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x + this.dim * dimFactor,
                                            y: this.y - this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x + this.dim * dimFactor,
                                            y: this.y + this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x + this.dim * dimFactor * midFactor,
                                            y: this.y,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'West'
                                        || direction === 'South West'
                                        || direction === 'North West' || allTarget) {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x - this.dim * dimFactor,
                                            y: this.y - this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x - this.dim * dimFactor,
                                            y: this.y + this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x - this.dim * dimFactor * midFactor,
                                            y: this.y,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'North' || allTarget) {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x - this.dim * dimFactor,
                                            y: this.y - this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x + this.dim * dimFactor,
                                            y: this.y - this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x,
                                            y: this.y - this.dim * dimFactor * midFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'South' || allTarget) {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x - this.dim * dimFactor,
                                            y: this.y + this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x + this.dim * dimFactor,
                                            y: this.y + this.dim * dimFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            x: this.x,
                                            y: this.y + this.dim * dimFactor * midFactor,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                }, 200);
                            }
                            break;
                        default:
                            break;
                    }
                    PIXI_INIT_ELEMENT(this);
                    switch (this.type) {
                        case 'USER_MAIN':
                            this.ArrowLeft = startListenKey({
                                key: 'ArrowLeft',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    // this.x = validatePosition(this, 'x', pos => pos - this.vel, ['BUILDING']);
                                    if (baseMatrix[parseInt(this.y)][parseInt(this.x) - 1] === 0)
                                        this.x = this.x - this.vel;

                                }
                            });
                            this.clearsIntervals.push('ArrowLeft');
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    // this.x = validatePosition(this, 'x', pos => pos + this.vel, ['BUILDING']);
                                    if (baseMatrix[parseInt(this.y)][parseInt(this.x) + 1] === 0)
                                        this.x = this.x + this.vel;
                                }
                            });
                            this.clearsIntervals.push('ArrowRight');
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    // this.y = validatePosition(this, 'y', pos => pos - this.vel, ['BUILDING']);
                                    if (baseMatrix[parseInt(this.y) - 1][parseInt(this.x)] === 0)
                                        this.y = this.y - this.vel;
                                }
                            });
                            this.clearsIntervals.push('ArrowUp');
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    // this.y = validatePosition(this, 'y', pos => pos + this.vel, ['BUILDING']);
                                    if (baseMatrix[parseInt(this.y) + 1][parseInt(this.x)] === 0)
                                        this.y = this.y + this.vel;
                                }
                            });
                            this.clearsIntervals.push('ArrowDown');



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
                        case 'TOUCH':
                            this.onCanvasClick = event => {

                                let offsetX = parseInt(((event.offsetX * maxRangeMap) / cyberiaonline.canvasDim)) + 1;
                                let offsetY = parseInt(((event.offsetY * maxRangeMap) / cyberiaonline.canvasDim)) + 1;

                                this.x = offsetX;
                                this.y = offsetY;

                                COMPONENTS['cross-effect'].event(this);

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
                    framesCount++;
                    if (framesCount % 10000 === 0) {
                        framesCount = 0;
                        // elements.push(gen().init({
                        //     type: 'BOT'
                        // }));
                    }
                    let element;
                    switch (this.type) {
                        case 'BOT':

                            if (
                                this.path[0]
                                && getDistance(
                                    this.path[0][0],
                                    this.path[0][1],
                                    this.path[this.path.length - 1][0],
                                    this.path[this.path.length - 1][1]
                                ) < this.searchStopRange
                                && this.autoShoot === true
                            ) {
                                // console.error('distance reguler 1');
                                this.path = [];
                            }

                            else if (this.autoShoot === true && !this.path[0]) {
                                // console.error('distance reguler 2');
                            }
                            if (this.path.length === 0 && this.autoShoot === false)
                                this.path = generatePath(this);


                            element = validatePathLoop(this);
                            this.path = element.path;
                            this.x = element.x;
                            this.y = element.y;
                            if (this.autoShoot === true && this.shoot)
                                Object.keys(this.shoot).map(keyShoot => this.shoot[keyShoot]());
                            if (this.autoTarget) this.autoTarget();

                            break;
                        case 'USER_MAIN':
                            element = validatePathLoop(this);
                            this.path = element.path;
                            this.x = element.x;
                            this.y = element.y;
                            if (this.autoMovementShoot) this.autoMovementShoot();

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
                }
            };
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const INSTANCE_GENERATOR = () => {


            removeAllElements();

            elements = elements.concat([
                gen().init({
                    type: 'FLOOR',
                    dim: maxRangeMap,
                    color: 'dark green (x11)',
                    x: maxRangeMap / 2,
                    y: maxRangeMap / 2
                })
            ]);

            elements = elements.concat(
                range(1, 3)
                    .map(() => gen().init({
                        type: 'BUILDING',
                        matrix: { x: 2, y: 3 }
                    }))
            );
            elements = elements.concat(
                range(1, 3)
                    .map(() => gen().init({
                        type: 'BOT'
                    }))
            );
            // mobile friendly
            elements = elements.concat(
                [
                    // gen().init({
                    //     type: 'BUILDING',
                    //     matrix: { x: 2, y: 2 },
                    //     x: 0,
                    //     y: 0
                    // }),
                    gen().init({
                        type: 'USER_MAIN',
                        // x: 3,
                        // y: 3,
                        id: mainUserId
                        // matrix: { x: 1, y: 2 }
                    }),
                    // gen().init({
                    //     type: 'BOT'
                    // }),
                    gen().init({
                        type: 'BOT_BUG'
                    }),
                    gen().init({
                        color: 'safety orange'
                    }),
                    gen().init({
                        type: 'TOUCH',
                        x: 1,
                        y: 1
                    }),
                ]
            );

            baseMatrix = range(minRangeMap, maxRangeMap).map(y => {
                return range(minRangeMap, maxRangeMap).map(x => {
                    return elements.filter(element =>
                        element.type === 'BUILDING'
                        &&
                        validateCollision(
                            { x: element.x, y: element.y, dim: element.dim },
                            { x, y, dim: getMainUserElement().dim }
                        )).length > 0
                        || x === maxRangeMap
                        || x === minRangeMap
                        || y === maxRangeMap
                        || y === minRangeMap ? 1 : 0;
                });
            });
            // console.table(baseMatrix);

            maxBots = newInstance(elements.filter(x => x.type === 'BOT').length);

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

            s(`.${this.inFullScreenBtn}`).onclick = () => fullScreenIn();
            s(`.${this.outFullScreenBtn}`).onclick = () => fullScreenOut();

            s(`.${homeBtnId}`).onclick = () =>
                GLOBAL.router({ newPath: buildBaseUri() });

            if (this.loopGame) clearInterval(this.loopGame);
            const renderGame = () => elements.map(x => x.loop());
            renderGame();
            this.loopGame = setInterval(() => renderGame(), timeIntervalGame);
        });

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------


        return /*html*/`

            <div class='fix ${this.windowGameId}'>
                <style class='window-game-${this.windowGameId}'></style>
                <style class='window-game-${this.windowGamePanel}'></style>
                <style>

                 

                    ${pixiContainerId} { }

                    canvas {
                       /* transform: scale(-1, 1) rotate(90deg); */
                        display: block;
                        margin: auto;
                    }
                    
                    .panel-btns {
                        margin: 10px;
                        font-size: 20px;
                    }

                    .panel-btns:hover {
                        color: yellow;
                    }

                    .panel-btns-container {
                        margin: auto;
                        background: #100C08;
                    }

                    .${this.coinHtmlIndicatorContainer} {
                        color: yellow;
                        font-size: 22px;
                        padding: 5px;
                        ${borderChar('black', 2)}
                    }

                </style>
                <div class='abs center'>
                    <${pixiContainerId} class='in'></${pixiContainerId}>
                </div>

                <${this.windowGamePanel} class='abs'>

                    <div class='in panel-btns-container'>  
                        <i class='fas fa-arrows-alt panel-btns ${this.inFullScreenBtn}' aria-hidden='true'></i>
                        <i class='fas fa-times panel-btns ${this.outFullScreenBtn}' style='display: none' aria-hidden='true'></i> 
                        <i class='fas fa-home panel-btns ${homeBtnId}' aria-hidden='true'></i>  
                        <i class='fas fa-refresh panel-btns ${newInstanceBtn}' aria-hidden='true'></i>    
                        <div class='inl ${this.coinHtmlIndicatorContainer}'>$0</div>              
                         
                    </div>
                </${this.windowGamePanel}>

            </div>
            
        
        `
    },
    dimStateController: function () {
        const dimData = dimState();
        dimData.minValue = dimData.minType === 'width' ? dimData.minValue : dimData.minValue - this.barHeight;
        this.canvasDim = dimData.minValue;
        return dimData;
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
                    text-align: left;
                    ${borderChar(2, 'black')}
                }
            `);
        htmls('.' + this.htmlPixiFontLayer, /*css*/`
                ${this.htmlPixiFontLayer} {
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
        htmls('.window-game-' + this.windowGamePanel, /*css*/`
                ${this.windowGamePanel} {
                    width: 100%;
                    bottom: 0px;
                    left: 0px;
                    height: 0px;
                    font-size: 10px;
                }
                .panel-btns-container {
                    width: ${this.canvasDim}px;
                    height: ${window.innerHeight - this.canvasDim}px;
                }
        `);
        htmls('.window-game-' + this.windowGameId, /*css*/`
                .${this.windowGameId} {
                    top: 0%;
                    left: 0%;
                    width: 100%;
                    height: ${this.canvasDim}px;
                    z-index: ${this.windowGameZindex};
                    background: black;
                }
        `);

    },
    routerDisplay: function (options) {
        this.renderHtmlPixiLayer();
    },
    updateWindowGameDim: function () {
        range(0, 10).map(attemp => {
            setTimeout(() => {
                const dimData = this.dimStateController();
                s('canvas').style.width = `${dimData.minValue}px`;
                s('canvas').style.height = `${dimData.minValue}px`;
                this.renderHtmlPixiLayer();
            }, attemp * 100);
        });
    },
    offFullScreen: function () {
        console.warn('pixijs cyberiaonline | offFullScreen');
        s(`.${this.inFullScreenBtn}`).style.display = null;
        s(`.${this.outFullScreenBtn}`).style.display = 'none';
    },
    onFullScreen: function () {
        console.warn('pixijs cyberiaonline | onFullScreen');
        s(`.${this.inFullScreenBtn}`).style.display = 'none';
        s(`.${this.outFullScreenBtn}`).style.display = null;
    },
    changeWindowDimension: function (dimensionData) {
        console.log('pixijs cyberiaonline | changeWindowDimension', dimensionData);
        this.updateWindowGameDim();

    }
};