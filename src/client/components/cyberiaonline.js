

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

        const setShoot = (element, fn) => {
            element.shoot = () => {
                if (element.validateShoot) {
                    element.validateShoot = false;
                    setTimeout(() => {
                        element.validateShoot = true;
                    }, element.shootTimeInterval);
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
                componentsFunctions: {},
                componentsElements: {},
                componentsParams: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) { }
            }

        */

        const COMPONENTS = {
            'damage-indicator': {
                componentsFunctions: {},
                componentsElements: {},
                componentsParams: {},
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
                componentsFunctions: {
                    renderX: (component, element) =>
                        element.y * component.componentsParams.renderDim - (element.dim * pixiAmplitudeFactor),
                    renderY: (component, element) =>
                        element.x * component.componentsParams.renderDim - (element.dim * pixiAmplitudeFactor)
                },
                componentsElements: {},
                componentsParams: {
                    renderDim: cyberiaonline.canvasDim / maxRangeMap,
                    id: {}
                },
                init: function (element) {

                    this.componentsParams.id[element.id] = 'display-id-' + element.id;

                    append(cyberiaonline.htmlPixiFontLayer, /*html*/`
                            <div class='abs ${this.componentsParams.id[element.id]}' style='
                            top: ${this.componentsFunctions.renderX(this, element)}px;
                            left: ${this.componentsFunctions.renderY(this, element)}px;
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
                    if (s(`.${this.componentsParams.id[element.id]}`)) {
                        s(`.${this.componentsParams.id[element.id]}`).style.top =
                            `${this.componentsFunctions.renderX(this, element)}px`;
                        s(`.${this.componentsParams.id[element.id]}`).style.left =
                            `${this.componentsFunctions.renderY(this, element)}px`;
                    } else {
                        console.error('!s(`.${this.componentsParams.id[element.id]}`)');
                    }
                },
                event: function (element) { },
                delete: function (element) {
                    s(`.${this.componentsParams.id[element.id]}`).remove();
                    delete this.componentsParams.id[element.id];
                }
            },
            'bar-life': {
                componentsFunctions: {},
                componentsElements: {
                    bar: {}
                },
                componentsParams: {},
                init: function (element) {


                    this.componentsElements.bar[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.bar[element.id].tint = pixiColors['electric green'];
                    this.componentsElements.bar[element.id].width = element.dim * pixiAmplitudeFactor;
                    this.componentsElements.bar[element.id].height = element.dim * pixiAmplitudeFactor * 0.2;
                    this.componentsElements.bar[element.id].x = 0;
                    this.componentsElements.bar[element.id].y = -1 * element.dim * pixiAmplitudeFactor * 0.2;
                    elementsContainer[element.id].addChild(this.componentsElements.bar[element.id]);


                },
                loop: function (element) { },
                event: function (element) {
                    if (element.life <= 0) element.life = 0;
                    const factorLife = element.life / element.maxLife;
                    // console.error('factorLife', factorLife);
                    this.componentsElements.bar[element.id].width = element.dim * pixiAmplitudeFactor * factorLife;
                    if (element.life === 0) {
                        const typeElement = `${element.type}`;
                        setTimeout(() => {
                            switch (typeElement) {
                                case 'BOT':
                                    elements.push(gen().init({
                                        container: containerID,
                                        type: 'BOT'
                                    }));
                                    break;
                                case 'USER_MAIN':
                                    elements.push(gen().init({
                                        container: containerID,
                                        type: 'USER_MAIN',
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
                    delete this.componentsElements.bar[element.id];
                }
            },
            'random-head-common': {
                componentsParams: {
                    color: null,
                    width: null,
                    height: null,
                    eyeColor: null,
                    eyeWidth: null,
                    eyeHeight: null
                },
                componentsElements: {
                    head: {},
                    eyesLeft: {},
                    eyesRight: {}
                },
                init: function (element) {

                    if (this.componentsParams.color === null) this.componentsParams.color = getRandomPixiColor();
                    if (this.componentsParams.width === null) this.componentsParams.width = ((element.dim) * pixiAmplitudeFactor) * (100 / random(150, 300));
                    if (this.componentsParams.height === null) this.componentsParams.height = ((element.dim) * pixiAmplitudeFactor) * (100 / random(150, 300));

                    this.componentsElements.head[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.head[element.id].tint = this.componentsParams.color;
                    this.componentsElements.head[element.id].width = this.componentsParams.width;
                    this.componentsElements.head[element.id].height = this.componentsParams.height;
                    this.componentsElements.head[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.componentsParams.width) / 2;
                    this.componentsElements.head[element.id].y = 0;
                    elementsContainer[element.id].addChild(this.componentsElements.head[element.id]);

                    if (this.componentsParams.eyeWidth === null) this.componentsParams.eyeWidth = ((element.dim) * pixiAmplitudeFactor) * (100 / random(250, 600));
                    if (this.componentsParams.eyeHeight === null) this.componentsParams.eyeHeight = ((element.dim) * pixiAmplitudeFactor) * (100 / random(250, 600));
                    if (this.componentsParams.eyeColor === null) this.componentsParams.eyeColor = getRandomPixiColor();

                    this.componentsElements.eyesLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.eyesLeft[element.id].tint = this.componentsParams.eyeColor;
                    this.componentsElements.eyesLeft[element.id].width = this.componentsParams.eyeWidth;
                    this.componentsElements.eyesLeft[element.id].height = this.componentsParams.eyeHeight;
                    this.componentsElements.eyesLeft[element.id].x = (((element.dim) * pixiAmplitudeFactor) / 2) - (this.componentsParams.eyeWidth / 2); /// - [this.componentsParams.eyeWidth, 0][random(0, 1)];
                    this.componentsElements.eyesLeft[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.eyesLeft[element.id]);

                    this.componentsElements.eyesRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.eyesRight[element.id].tint = this.componentsParams.eyeColor;
                    this.componentsElements.eyesRight[element.id].width = this.componentsParams.eyeWidth;
                    this.componentsElements.eyesRight[element.id].height = this.componentsParams.eyeHeight;
                    this.componentsElements.eyesRight[element.id].x = (((element.dim) * pixiAmplitudeFactor) / 2) - (this.componentsParams.eyeWidth / 2); /// + [this.componentsParams.eyeWidth, 0][random(0, 1)];
                    this.componentsElements.eyesRight[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.eyesRight[element.id]);

                },
                loop: function (element) {
                    let direction = element.direction;
                    if (direction === 'East'
                        || direction === 'South East'
                        || direction === 'North East') {
                        this.componentsElements.eyesLeft[element.id].visible = false;
                        this.componentsElements.eyesRight[element.id].visible = true;
                    }

                    if (direction === 'West'
                        || direction === 'South West'
                        || direction === 'North West') {
                        this.componentsElements.eyesRight[element.id].visible = false;
                        this.componentsElements.eyesLeft[element.id].visible = true;
                    }

                    if (direction === 'North') {
                        this.componentsElements.eyesRight[element.id].visible = false;
                        this.componentsElements.eyesLeft[element.id].visible = false;
                    }

                    if (direction === 'South') {
                        this.componentsElements.eyesRight[element.id].visible = true;
                        this.componentsElements.eyesLeft[element.id].visible = true;
                    }

                },
                event: function (element) { },
                delete: function (element) {
                    delete this.componentsElements.head[element.id];
                    delete this.componentsElements.eyesLeft[element.id];
                    delete this.componentsElements.eyesRight[element.id];
                    // respawn random params
                    this.componentsParams.color = null;
                    this.componentsParams.width = null;
                    this.componentsParams.height = null;
                    this.componentsParams.eyeColor = null;
                    this.componentsParams.eyeWidth = null;
                    this.componentsParams.eyeHeight = null;
                }
            },
            'texture|zinnwaldite brown|cafe noir': {
                componentsFunctions: {},
                componentsElements: {
                    layer1: {},
                    layer2: {}
                },
                componentsParams: {},
                init: function (element) {
                    this.componentsElements.layer1[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.layer1[element.id].tint = pixiColors['zinnwaldite brown'];
                    this.componentsElements.layer1[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 1.1;
                    this.componentsElements.layer1[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 1.1;
                    this.componentsElements.layer1[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.componentsElements.layer1[element.id].width) / 2;
                    this.componentsElements.layer1[element.id].y = (((element.dim) * pixiAmplitudeFactor) - this.componentsElements.layer1[element.id].height) / 2;
                    elementsContainer[element.id].addChild(this.componentsElements.layer1[element.id]);

                    this.componentsElements.layer2[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.layer2[element.id].tint = pixiColors['cafe noir'];
                    this.componentsElements.layer2[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 1.5;
                    this.componentsElements.layer2[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 1.5;
                    this.componentsElements.layer2[element.id].x = (((element.dim) * pixiAmplitudeFactor) - this.componentsElements.layer2[element.id].width) / 2;
                    this.componentsElements.layer2[element.id].y = (((element.dim) * pixiAmplitudeFactor) - this.componentsElements.layer2[element.id].height) / 2;
                    elementsContainer[element.id].addChild(this.componentsElements.layer2[element.id]);
                },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) {
                    delete this.componentsElements.layer1[element.id];
                    delete this.componentsElements.layer2[element.id];
                }
            },
            'background-circle': {
                componentsFunctions: {
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
                componentsElements: {
                    circle: {}
                },
                componentsParams: {
                    radioPor: 0.9,
                    collisionColor: {}
                },
                init: function (element) {

                    this.componentsParams.collisionColor[element.id] = true;

                    this.componentsElements.circle[element.id] = new PIXI.Graphics();
                    this.componentsElements.circle[element.id].width = (element.dim * pixiAmplitudeFactor);
                    this.componentsElements.circle[element.id].height = (element.dim * pixiAmplitudeFactor);
                    this.componentsElements.circle[element.id].beginFill(pixiColors["black"]);
                    this.componentsElements.circle[element.id].lineStyle(0);
                    this.componentsElements.circle[element.id].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * this.componentsParams.radioPor * 0.5
                    ); // x,y,radio
                    this.componentsElements.circle[element.id].endFill();

                    elementsContainer[element.id].addChild(this.componentsElements.circle[element.id]);

                    switch (element.type) {
                        case 'USER_MAIN':
                            this.componentsElements.circle[element.id].visible = false;
                            break;
                        case 'TOUCH':
                            this.componentsElements.circle[element.id].visible = false;
                            break;
                        case 'BOT':
                            this.componentsElements.circle[element.id].visible = false;
                            break;
                        default:
                    };


                },
                loop: function (element) {
                    if (this.componentsFunctions.alertCollision(element) && this.componentsParams.collisionColor[element.id] === true) {
                        this.componentsParams.collisionColor[element.id] = false;
                        this.componentsElements.circle[element.id].clear();
                        this.componentsElements.circle[element.id].beginFill(pixiColors["magenta"]);
                        this.componentsElements.circle[element.id].lineStyle(0);
                        this.componentsElements.circle[element.id].drawCircle(
                            (element.dim * pixiAmplitudeFactor) * 0.5,
                            (element.dim * pixiAmplitudeFactor) * 0.5,
                            (element.dim * pixiAmplitudeFactor) * this.componentsParams.radioPor * 0.5
                        ); // x,y,radio
                        this.componentsElements.circle[element.id].endFill();
                        setTimeout(() => {
                            if (!this.componentsElements.circle[element.id]) return;
                            setTimeout(() => {
                                if (!this.componentsElements.circle[element.id]) return;
                                this.componentsParams.collisionColor[element.id] = true;
                            }, 500);
                            this.componentsElements.circle[element.id].clear();
                            this.componentsElements.circle[element.id].beginFill(pixiColors["black"]);
                            this.componentsElements.circle[element.id].lineStyle(0);
                            this.componentsElements.circle[element.id].drawCircle(
                                (element.dim * pixiAmplitudeFactor) * 0.5,
                                (element.dim * pixiAmplitudeFactor) * 0.5,
                                (element.dim * pixiAmplitudeFactor) * this.componentsParams.radioPor * 0.5
                            ); // x,y,radio
                            this.componentsElements.circle[element.id].endFill();
                        }, 500);
                    }
                },
                event: function (element) {


                },
                delete: function (element) {
                    delete this.componentsElements.circle[element.id];
                }
            },
            'background': {
                componentsFunctions: {
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
                componentsElements: {
                    background: {},
                },
                init: function (element) {

                    this.componentsElements.background[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.background[element.id].x = 0;
                    this.componentsElements.background[element.id].y = 0;
                    this.componentsElements.background[element.id].width = (element.dim) * pixiAmplitudeFactor;
                    this.componentsElements.background[element.id].height = (element.dim) * pixiAmplitudeFactor;
                    this.componentsElements.background[element.id].tint = pixiColors[element.color];
                    elementsContainer[element.id].addChild(this.componentsElements.background[element.id]);

                    switch (element.type) {
                        case 'USER_MAIN':
                            this.componentsElements.background[element.id].visible = false;
                            break;
                        case 'TOUCH':
                            this.componentsElements.background[element.id].visible = false;
                            break;
                        case 'BOT':
                            this.componentsElements.background[element.id].visible = false;
                            break;
                        default:
                    };


                },
                loop: function (element) {
                    if (this.componentsFunctions.alertCollision(element)) {
                        this.componentsElements.background[element.id].tint = pixiColors["magenta"];
                    } else if (this.componentsElements.background[element.id].tint !== pixiColors[element.color]) {
                        this.componentsElements.background[element.id].tint = pixiColors[element.color];
                    }
                },
                event: function (element) {


                },
                delete: function (element) {
                    delete this.componentsElements.background[element.id];
                }
            },
            'anon-foots': {
                componentsElements: {
                    footLeft: {},
                    footRight: {}
                },
                componentsParams: {
                    foot: {}
                },
                init: function (element) {


                    this.componentsParams.foot[element.id] = 0;

                    this.componentsElements.footLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.footLeft[element.id].tint = pixiColors['white'];
                    this.componentsElements.footLeft[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                    this.componentsElements.footLeft[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 3.25;
                    this.componentsElements.footLeft[element.id].y = element.dim * 0.8 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.footLeft[element.id]);

                    this.componentsElements.footRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.footRight[element.id].tint = pixiColors['white'];
                    this.componentsElements.footRight[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                    this.componentsElements.footRight[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 1.75;
                    this.componentsElements.footRight[element.id].y = element.dim * 0.8 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.footRight[element.id]);
                },
                loop: function (element) {
                    if ((element.lastX !== parseInt(element.renderX) || element.lastY !== parseInt(element.renderY))) {
                        let direction = element.direction;

                        switch (this.componentsParams.foot[element.id]) {
                            case 0:
                                this.componentsElements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) * (direction === 'South' || direction === 'North' ? 0 : (1 / 10));
                                this.componentsElements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                break;
                            case 50:
                                this.componentsElements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                this.componentsElements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) * (direction === 'South' || direction === 'North' ? 0 : (1 / 10));
                                break;
                            case 100:
                                this.componentsParams.foot[element.id] = -1;
                                break;
                        }
                        this.componentsParams.foot[element.id]++;
                    } else {
                        const currentElement = newInstance(element);
                        setTimeout(() => {
                            if (element.lastX === parseInt(currentElement.renderX) && element.lastY === parseInt(currentElement.renderY) && elementsContainer[element.id]) {
                                this.componentsElements.footLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                                this.componentsElements.footRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 5;
                            }
                        }, 100);
                    }

                },
                event: function (element) { },
                delete: function (element) {
                    delete this.componentsParams.foot[element.id];
                    delete this.componentsElements.footLeft[element.id];
                    delete this.componentsElements.footRight[element.id];
                }
            },
            'anon-head': {
                componentsElements: {
                    head: {},
                    eyesLeft: {},
                    eyesRight: {}
                },
                init: function (element) {

                    this.componentsElements.head[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.head[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 2;
                    this.componentsElements.head[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 2;
                    this.componentsElements.head[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 4;
                    this.componentsElements.head[element.id].y = 0;
                    elementsContainer[element.id].addChild(this.componentsElements.head[element.id]);

                    this.componentsElements.eyesLeft[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.eyesLeft[element.id].tint = pixiColors['blue'];
                    this.componentsElements.eyesLeft[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.eyesLeft[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.eyesLeft[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 3.25;
                    this.componentsElements.eyesLeft[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.eyesLeft[element.id]);

                    this.componentsElements.eyesRight[element.id] = new PIXI.Sprite(PIXI.Texture.WHITE);
                    this.componentsElements.eyesRight[element.id].tint = pixiColors['blue'];
                    this.componentsElements.eyesRight[element.id].width = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.eyesRight[element.id].height = ((element.dim) * pixiAmplitudeFactor) / 6.5;
                    this.componentsElements.eyesRight[element.id].x = ((element.dim) * pixiAmplitudeFactor) / 1.75;
                    this.componentsElements.eyesRight[element.id].y = 0.4 * pixiAmplitudeFactor;
                    elementsContainer[element.id].addChild(this.componentsElements.eyesRight[element.id]);


                },
                loop: function (element) {
                    let direction = element.direction;
                    if (direction === 'East'
                        || direction === 'South East'
                        || direction === 'North East') {
                        this.componentsElements.eyesLeft[element.id].visible = false;
                        this.componentsElements.eyesRight[element.id].visible = true;
                    }

                    if (direction === 'West'
                        || direction === 'South West'
                        || direction === 'North West') {
                        this.componentsElements.eyesRight[element.id].visible = false;
                        this.componentsElements.eyesLeft[element.id].visible = true;
                    }

                    if (direction === 'North') {
                        this.componentsElements.eyesRight[element.id].visible = false;
                        this.componentsElements.eyesLeft[element.id].visible = false;
                    }

                    if (direction === 'South') {
                        this.componentsElements.eyesRight[element.id].visible = true;
                        this.componentsElements.eyesLeft[element.id].visible = true;
                    }

                },
                event: function (element) {

                },
                delete: function (element) {
                    delete this.componentsElements.head[element.id];
                    delete this.componentsElements.eyesLeft[element.id];
                    delete this.componentsElements.eyesRight[element.id];
                }
            },
            'BULLET-THREE-RANDOM-CIRCLE-COLOR': {
                //      X
                // >  X
                //      X
                componentsFunctions: {
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
                    setShoot: element => setShoot(element, () => {
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
                componentsElements: {},
                componentsParams: {
                    value: 20,
                    vel: 2500,
                    validateShoot: {}
                },
                init: function (element) {
                    this.componentsParams.validateShoot[element.id] = true;
                },
                loop: function (element) {
                    const participantsFrom = ['BULLET-THREE-RANDOM-CIRCLE-COLOR'];
                    const participantsTo = ['BOT', 'USER_MAIN'];
                    const collisionTest =
                        this.componentsFunctions.alertCollision(element, participantsFrom, participantsTo)
                    if (this.componentsParams.validateShoot[element.id] === true && collisionTest.length > 0) {

                        this.componentsParams.validateShoot[element.id] = false;
                        setTimeout(() => {
                            this.componentsParams.validateShoot[element.id] = true;
                        }, this.componentsParams.vel);


                        // console.error(this.componentsFunctions.alertCollision(element, participantsFrom, participantsTo));


                        collisionTest.map(element => {
                            element.life = element.life - this.componentsParams.value;
                            COMPONENTS['damage-indicator'].event(element, this.componentsParams.value);
                            COMPONENTS['bar-life'].event(element);
                            // console.error(element.life);
                        });
                    }
                },
                event: function (element) { },
                delete: function (element) { }
            },
            'BULLET-CROSS': {
                componentsFunctions: {
                    setShoot: element => setShoot(element, () => {
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
                componentsElements: {},
                componentsParams: {},
                init: function (element) { },
                loop: function (element) { },
                event: function (element) { },
                delete: function (element) { }

            },
            'cross-effect': {
                componentsElements: {
                    sprite: {}
                },
                init: function (element) { },
                loop: function (element) { },
                delete: function (eventHash) {
                    this.componentsElements.sprite[eventHash].destroy();
                    delete this.componentsElements.sprite[eventHash];
                },
                event: function (element) {
                    const valueAbsDiff = (element.dim) * pixiAmplitudeFactor / 6;
                    range(0, 4).map(i => {
                        const eventHash = 'x' + s4();
                        this.componentsElements.sprite[eventHash] = new PIXI.Sprite(PIXI.Texture.WHITE);
                        this.componentsElements.sprite[eventHash].width = (element.dim) * pixiAmplitudeFactor / 5;
                        this.componentsElements.sprite[eventHash].height = (element.dim) * pixiAmplitudeFactor / 5;
                        const xyCorrection = (this.componentsElements.sprite[eventHash].width / 2);
                        switch (i) {
                            case 0:
                                this.componentsElements.sprite[eventHash].x = ((element.dim) * pixiAmplitudeFactor / 2) - xyCorrection;
                                this.componentsElements.sprite[eventHash].y = ((element.dim) * pixiAmplitudeFactor / 2) - xyCorrection;
                                break;
                            case 1:
                                this.componentsElements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                this.componentsElements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                break;
                            case 2:
                                this.componentsElements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                this.componentsElements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                break;
                            case 3:
                                this.componentsElements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) - valueAbsDiff - xyCorrection;
                                this.componentsElements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                break;
                            case 4:
                                this.componentsElements.sprite[eventHash].x =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                this.componentsElements.sprite[eventHash].y =
                                    ((element.dim) * pixiAmplitudeFactor / 2) + valueAbsDiff - xyCorrection;
                                break;
                            default:
                                break;
                        }
                        this.componentsElements.sprite[eventHash].tint = pixiColors['red'];
                        elementsContainer[element.id].addChild(this.componentsElements.sprite[eventHash]);
                        setTimeout(() => {
                            this.delete(eventHash);
                        }, 1000);
                    });
                }
            },
            'random-circle-color': {
                componentsParams: {
                    circle: {}
                },
                componentsElements: {
                    circle: {}
                },
                init: function (element) {
                    this.componentsElements.circle[element.id] = new PIXI.Graphics();
                    this.componentsElements.circle[element.id].beginFill(randomNumberColor());
                    this.componentsElements.circle[element.id].lineStyle(0);
                    this.componentsElements.circle[element.id].drawCircle(0, 0, 1.5 * pixiAmplitudeFactor); // x,y,radio
                    this.componentsElements.circle[element.id].endFill();
                    this.componentsElements.circle[element.id].width = (element.dim * pixiAmplitudeFactor) / 4;
                    this.componentsElements.circle[element.id].height = (element.dim * pixiAmplitudeFactor) / 4;
                    elementsContainer[element.id].addChild(this.componentsElements.circle[element.id]);
                },
                loop: function (element) {
                    if (!this.componentsParams.circle[element.id])
                        this.componentsParams.circle[element.id] = 0;
                    switch (this.componentsParams.circle[element.id]) {
                        case 0:
                            this.componentsElements.circle[element.id].clear();
                            this.componentsElements.circle[element.id].beginFill(randomNumberColor());
                            this.componentsElements.circle[element.id].lineStyle(0);
                            this.componentsElements.circle[element.id].drawCircle(
                                0,
                                0,
                                2 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.componentsElements.circle[element.id].endFill();
                            break;
                        case 100:
                            this.componentsElements.circle[element.id].clear();
                            this.componentsElements.circle[element.id].beginFill(randomNumberColor());
                            this.componentsElements.circle[element.id].lineStyle(0);
                            this.componentsElements.circle[element.id].drawCircle(
                                0,
                                0,
                                3 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.componentsElements.circle[element.id].endFill();
                            break;
                        case 200:
                            this.componentsElements.circle[element.id].clear();
                            this.componentsElements.circle[element.id].beginFill(randomNumberColor());
                            this.componentsElements.circle[element.id].lineStyle(0);
                            this.componentsElements.circle[element.id].drawCircle(
                                0,
                                0,
                                2 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.componentsElements.circle[element.id].endFill();
                            break;
                        case 300:
                            this.componentsElements.circle[element.id].clear();
                            this.componentsElements.circle[element.id].beginFill(randomNumberColor());
                            this.componentsElements.circle[element.id].lineStyle(0);
                            this.componentsElements.circle[element.id].drawCircle(
                                0,
                                0,
                                1.5 * pixiAmplitudeFactor
                            ); // x,y,radio
                            this.componentsElements.circle[element.id].endFill();
                            break;
                        case 400:
                            this.componentsParams.circle[element.id] = -1;
                            break;
                    }
                    this.componentsParams.circle[element.id]++;
                },
                delete: function (element) {
                    delete this.componentsElements.circle[element.id];
                    delete this.componentsParams.circle[element.id];
                }
            },
            'random-circle-color-one-big': {
                componentsElements: {
                    circle: {}
                },
                init: function (element) { },
                loop: function (element) { },
                delete: function (eventHash) {
                    this.componentsElements.circle[eventHash].destroy();
                    delete this.componentsElements.circle[eventHash];
                },
                event: function (element) {
                    const eventHash = 'x' + s4();
                    const radioPor = 0.5;

                    this.componentsElements.circle[eventHash] = new PIXI.Graphics();
                    this.componentsElements.circle[eventHash].width = (element.dim * pixiAmplitudeFactor);
                    this.componentsElements.circle[eventHash].height = (element.dim * pixiAmplitudeFactor);
                    this.componentsElements.circle[eventHash].beginFill(randomNumberColor());
                    this.componentsElements.circle[eventHash].lineStyle(0);
                    this.componentsElements.circle[eventHash].drawCircle(
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * 0.5,
                        (element.dim * pixiAmplitudeFactor) * radioPor * 0.5
                    ); // x,y,radio
                    this.componentsElements.circle[eventHash].endFill();
                    elementsContainer[element.id].addChild(this.componentsElements.circle[eventHash]);


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
                    this.dim = options.dim ? options.dim : 2; // 3; // 1.5
                    this.color = options.color ? options.color : 'red';
                    this.path = [];
                    this.borderRadius = 100;
                    this.clearsIntervals = [];
                    this.shootTimeInterval = 100;
                    this.validateShoot = true;
                    this.direction = options.direction !== undefined ? options.direction : 'South';
                    this.components = options.components ? options.components : ['background'];
                    this.deadDelay = 2000;
                    this.maxLife = 100;
                    this.life = 100;
                    this.parent = options.parent ? options.parent : undefined;
                    this.aggro = random(0, 10);
                    this.range = maxRangeMap * 0.3;
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
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].componentsFunctions.setShoot(this);
                            // COMPONENTS['BULLET-CROSS'].componentsFunctions.setShoot(this);
                            break;
                        case 'BOT':
                            if (!(options.x !== undefined && options.y !== undefined)) {
                                const BOT_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                                this.x = BOT_getAvailablePosition.x;
                                this.y = BOT_getAvailablePosition.y;
                            }
                            this.color = 'electric green';
                            this.vel = 0.025;
                            this.shootTimeInterval = 4000;
                            this.components = this.components.concat(
                                [
                                    'random-head-common',
                                    'anon-foots',
                                    'display-id',
                                    'bar-life'
                                ]
                            );
                            COMPONENTS['BULLET-THREE-RANDOM-CIRCLE-COLOR'].componentsFunctions.setShoot(this);
                            this.shootTimeInterval = 5000;

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
                                    this.x = validatePosition(this, 'x', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowLeft');
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    this.x = validatePosition(this, 'x', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowRight');
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    this.y = validatePosition(this, 'y', pos => pos - this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowUp');
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: timeIntervalGame,
                                onKey: () => {
                                    this.path = [];
                                    this.delayVelPath = 0;
                                    this.y = validatePosition(this, 'y', pos => pos + this.vel, ['BUILDING']);
                                }
                            });
                            this.clearsIntervals.push('ArrowDown');

                            ['q', 'Q', 'w', 'W'].map(qKey => {

                                this[`key_${qKey}`] = startListenKey({
                                    key: qKey,
                                    vel: timeIntervalGame,
                                    onKey: () => {
                                        console.log('onKey', this.id);
                                        this.shoot();
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
                            if (this.path.length === 0)
                                this.path = generatePath(this);


                            element = validatePathLoop(this);
                            this.path = element.path;
                            this.x = element.x;
                            this.y = element.y;
                            if (this.autoShoot === true && this.shoot) this.shoot();
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

            s(`.${BtnQ}`).onclick = () => elements.map(x => x.shoot && x.type === 'USER_MAIN' ? x.shoot() : null);
            s(`.${BtnW}`).onclick = () => elements.map(x => x.shoot && x.type === 'USER_MAIN' ? x.shoot() : null);

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