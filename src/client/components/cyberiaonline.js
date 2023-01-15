

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


        const BtnQ = id();
        const BtnW = id();
        const fullScreenBtn = id();

        let baseMatrix = [[]];
        let maxBots = 0;
        let mainUserId = id();

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

            let x, y, type, elementsSearch, elementsRange;
            let autoTargetCondition = false;

            if (elementsCollisions.x !== undefined && elementsCollisions.y !== undefined) {
                type = 'snail';
                x = parseInt(`${elementsCollisions.x}`);
                y = parseInt(`${elementsCollisions.y}`);
                if (elementsCollisions.elementsSearch !== undefined && elementsCollisions.elementsRange !== undefined) {
                    elementsSearch = newInstance(elementsCollisions.elementsSearch);
                    elementsRange = newInstance(elementsCollisions.elementsRange);
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
                        searchCondition = () => countSteps < elementsRange;
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

        const setShoot = (element, btn, fn) => {
            if (!element.shoot) element.shoot = {};
            element.shoot[btn] = () => {
                if (element.validateShoot[btn]) {
                    element.validateShoot[btn] = false;
                    setTimeout(() => {
                        element.validateShoot[btn] = true;
                    }, element.shootTimeInterval[btn]);
                    fn();
                }
            };
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


            s(pixiContainerId).appendChild(app.view);
            app.stage.addChild(container); // container to pixi app
            container.x = 0;
            container.y = 0;
            container.width = maxRangeMap * pixiAmplitudeFactor;
            container.height = maxRangeMap * pixiAmplitudeFactor;

            append(pixiContainerId, /*html*/`
                <style class='${this.htmlPixiLayer}'></style>

                <style>
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
                </style>

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
                            top: ${(element.y * cyberiaonline.canvasDim) / maxRangeMap}px;
                            left: ${(element.x * cyberiaonline.canvasDim) / maxRangeMap}px;
                            color: red;
                            font-family: retro;
                            /* border: 2px solid magenta; */
                            '>- ${value}</span>
                    `);
                    setTimeout(() => {
                        s(`.${fontEffectId}`).remove();
                    }, 1000);
                },
                delete: function (element) { }
            },
            'display-id': {
                functions: {
                    renderX: (component, element) =>
                        element.y * component.data.renderDim - (element.dim * pixiAmplitudeFactor),
                    renderY: (component, element) =>
                        element.x * component.data.renderDim - (element.dim * pixiAmplitudeFactor)
                },
                elements: {},
                data: {
                    renderDim: cyberiaonline.canvasDim / maxRangeMap,
                    id: {}
                },
                init: function (element) {

                    this.data.id[element.id] = 'display-id-' + element.id;

                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <div class='abs ${this.data.id[element.id]}' style='
                            top: ${this.functions.renderX(this, element)}px;
                            left: ${this.functions.renderY(this, element)}px;
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
                            `${this.functions.renderX(this, element)}px`;
                        s(`.${this.data.id[element.id]}`).style.left =
                            `${this.functions.renderY(this, element)}px`;
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
                    if (element.life <= 0) element.life = 0;
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
                                            container: containerID,
                                            type: 'BOT'
                                        }));
                                    break;
                                case 'USER_MAIN':
                                    if (elements.filter(x => x.type === 'USER_MAIN').length === 0)
                                        elements.push(gen().init({
                                            container: containerID,
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
                        removeElement(element.id);
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
                    this.elements.circle[element.id].beginFill(pixiColors["black"]);
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
                        this.elements.circle[element.id].beginFill(pixiColors["magenta"]);
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
                            this.elements.circle[element.id].beginFill(pixiColors["black"]);
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
                        this.elements.background[element.id].tint = pixiColors["magenta"];
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
                    setShoot: (element, btn) => setShoot(element, btn, () => {
                        let xBullet = 0;
                        let yBullet = 0;
                        let direction = element.direction;
                        const factorCordDim = 1.5;

                        if (direction === 'East'
                            || direction === 'South East'
                            || direction === 'North East') {
                            xBullet = element.dim * factorCordDim;
                        }

                        if (direction === 'West'
                            || direction === 'South West'
                            || direction === 'North West') {
                            xBullet = element.dim * -factorCordDim;
                        }

                        if (direction === 'North') {
                            yBullet = element.dim * -factorCordDim;
                        }

                        if (direction === 'South') {
                            yBullet = element.dim * factorCordDim;
                        }

                        elements.push(gen().init({
                            id: id(),
                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                            color: 'dark red',
                            container: containerID,
                            x: element.x + xBullet,
                            y: element.y + yBullet,
                            direction: element.direction,
                            parent: element
                        }));
                    })
                },
                elements: {},
                data: {
                    value: 20,
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


                        collisionTest.map(element => {
                            element.life = element.life - this.data.value;
                            COMPONENTS['damage-indicator'].event(element, this.data.value);
                            COMPONENTS['bar-life'].event(element);
                            // console.error(element.life);
                        });
                    }
                },
                event: function (element) { },
                delete: function (element) { }
            },
            'BULLET-CROSS': {
                functions: {
                    setShoot: (element, btn) => setShoot(element, btn, () => {
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
                            container: containerID,
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
                    elementsContainer[element.id].addChild(this.elements.circle[eventHash]);


                    setTimeout(() => {
                        this.delete(eventHash);
                    }, 1000);

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
            const elementIndex = elements.findIndex(x => x.id === id);
            // logDataManage(elements[elementIndex]);
            if (elementIndex > -1) {
                if (elements[elementIndex].components)
                    elements[elementIndex].components.map(component =>
                        COMPONENTS[component].delete(elements[elementIndex]));
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
                    this.vel = options.vel ? options.vel : 0.1;
                    this.dim = options.dim ? options.dim : 3; // 2 // 3; // 1.5
                    this.color = options.color ? options.color : 'red';
                    this.path = [];
                    this.borderRadius = 100;
                    this.clearsIntervals = [];
                    this.shootTimeInterval = { q: 100, w: 100 };
                    this.validateShoot = { q: true, w: true };
                    this.direction = options.direction !== undefined ? options.direction : 'South';
                    this.components = options.components ? options.components : ['background'];
                    this.deadDelay = 2000;
                    this.maxLife = 100;
                    this.life = 100;
                    this.parent = options.parent ? options.parent : undefined;
                    this.aggro = random(0, 10);
                    this.range = maxRangeMap * 0.3;
                    this.minRange = this.range * 0.4;
                    this.autoShoot = false;

                    this.autoTargetIntervalCalculate = 1000;
                    this.autoTargetBlockCalculate = true;
                    this.autoTargetRange = getTargetRange(10);
                    switch (this.type) {
                        case 'BUILDING':
                            this.borderRadius = 0;
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
                            this.dim = this.dim * 0.8;
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].functions.setShoot(this, 'q');
                            COMPONENTS['BULLET-CROSS'].functions.setShoot(this, 'w');
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
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].functions.setShoot(this, 'q');
                            this.shootTimeInterval.q = 5000;

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
                                            //     'getDistance', targetDistance, this.range);
                                            if (
                                                targetDistance <= this.range &&
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
                                    //         elementsRange: this.autoTargetRange
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
                                removeElement(this.id);
                            }, 2000);
                            break;
                        case 'BULLET-THREE-RANDOM-CIRCLE-COLOR':
                            this.components = ['background-circle', this.type];
                            setTimeout(() => {
                                COMPONENTS['random-circle-color-one-big'].event(this);
                            });
                            setTimeout(() => {
                                removeElement(this.id);
                            }, 2000);

                            if (this.direction !== null) {
                                let direction = this.direction;
                                setTimeout(() => {

                                    if (direction === 'East'
                                        || direction === 'South East'
                                        || direction === 'North East') {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x + this.dim,
                                            y: this.y - this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x + this.dim,
                                            y: this.y + this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x + this.dim,
                                            y: this.y,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'West'
                                        || direction === 'South West'
                                        || direction === 'North West') {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x - this.dim,
                                            y: this.y - this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x - this.dim,
                                            y: this.y + this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x - this.dim,
                                            y: this.y,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'North') {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x - this.dim,
                                            y: this.y - this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x + this.dim,
                                            y: this.y - this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x,
                                            y: this.y - this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                    }

                                    if (direction === 'South') {
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x - this.dim,
                                            y: this.y + this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x + this.dim,
                                            y: this.y + this.dim,
                                            direction: null,
                                            parent: this.parent ? this.parent : undefined
                                        }));
                                        elements.push(gen().init({
                                            id: id(),
                                            type: 'BULLET-THREE-RANDOM-CIRCLE-COLOR',
                                            color: 'dark red',
                                            container: containerID,
                                            x: this.x,
                                            y: this.y + this.dim,
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

                            ['q', 'Q', 'w', 'W'].map(qKey => {

                                this[`key_${qKey}`] = startListenKey({
                                    key: qKey,
                                    vel: timeIntervalGame,
                                    onKey: () => {
                                        console.log('onKey', this.id);
                                        if (this.shoot && this.shoot[qKey.toLocaleLowerCase()])
                                            this.shoot[qKey.toLocaleLowerCase()]();
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
                                ) < this.minRange
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
                                Object.keys(this.shoot).map(btn => this.shoot[btn]());
                            if (this.autoTarget) this.autoTarget();

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
                }
            };
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const INSTANCE_GENERATOR = () => {


            removeAllElements();

            elements = elements.concat([
                gen().init({
                    container: containerID,
                    type: 'FLOOR',
                    dim: maxRangeMap,
                    color: 'dark green (x11)',
                    x: maxRangeMap / 2,
                    y: maxRangeMap / 2
                })
            ]);

            elements = elements.concat(
                range(0, 5)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BUILDING',
                        matrix: { x: 2, y: 3 }
                    }))
            );
            elements = elements.concat(
                range(1, 4)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BOT'
                    }))
            );
            // mobile friendly
            elements = elements.concat(
                [
                    // gen().init({
                    //     container: containerID,
                    //     type: 'BUILDING',
                    //     matrix: { x: 2, y: 2 },
                    //     x: 0,
                    //     y: 0
                    // }),
                    gen().init({
                        container: containerID,
                        type: 'USER_MAIN',
                        // x: 3,
                        // y: 3,
                        id: mainUserId
                        // matrix: { x: 1, y: 2 }
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
                    gen().init({
                        container: containerID,
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
                            { x, y, dim: elements.find(elementFind => elementFind.id === mainUserId).dim }
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

            s(`.${BtnQ}`).onclick = () => elements.map(x => x.shoot && x.shoot.q && x.type === 'USER_MAIN' ? x.shoot.q() : null);
            s(`.${BtnW}`).onclick = () => elements.map(x => x.shoot && x.shoot.w && x.type === 'USER_MAIN' ? x.shoot.w() : null);

            s(`.${fullScreenBtn}`).onclick = () => fullScreenIn();

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

                    ${pixiContainerId} { }

                    canvas {
                       /* transform: scale(-1, 1) rotate(90deg); */
                        display: block;
                        margin: auto;
                    }

                </style>
                <!--
                <${containerID} class='in'></${containerID}>
                -->
                <${pixiContainerId} class='in'></${pixiContainerId}>
            </div>
            <div class='in container' style='text-align: center'>
                    <br>
                    <button class='inl ${BtnQ}' style='font-size: 30px'>Q</button>
                    <button class='inl ${BtnW}' style='font-size: 30px'>W</button>
                    <br>
                    <button class='inl ${newInstanceBtn}'>${renderLang({ es: 'generar nueva instancia', en: 'new instance' })}</button>
                    <br>
                    <button class='inl ${fullScreenBtn}'>${renderLang({ es: 'Pantalla completa', en: 'Full screen' })}</button>
                    <br>
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
    },
    offFullScreen: () => {
        console.warn('offFullScreen');
    },
    onFullScreen: () => {
        console.warn('onFullScreen');
    }
};