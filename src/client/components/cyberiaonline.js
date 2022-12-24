

this.cyberiaonline = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();
        let elements = [];
        const minRangeMap = 0;
        const maxRangeMap = 100;


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (pos) => {
            if (pos < minRangeMap) return minRangeMap;
            if (pos > maxRangeMap) return maxRangeMap;
            return pos;
        };

        const validateCollision = (A, B) => {
            return (
                (A.y - (A.dim / 2)) <= (B.y + (B.dim / 2))
                &&
                (A.x + (A.dim / 2)) >= (B.x - (B.dim / 2))
                &&
                (A.y + (A.dim / 2)) >= (B.y - (B.dim / 2))
                &&
                (A.x - (A.dim / 2)) <= (B.x + (B.dim / 2))
            )
        };

        const getAvailablePosition = (elementClient, elementTypes) => {

            const matrix = range(minRangeMap, maxRangeMap).map(x => {
                return range(minRangeMap, maxRangeMap).map(y => {
                    return elements.filter(element =>
                        elementTypes.includes(element.type)
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

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const gen = () => {
            return {
                init: function (options) {
                    this.id = id();
                    this.x = options.x ? options.x : random(minRangeMap, maxRangeMap);
                    this.y = options.y ? options.y : random(minRangeMap, maxRangeMap);
                    this.container = options.container;
                    this.type = options.type;
                    this.vel = 10;
                    this.dim = 5;
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
                            const BOT_getAvailablePosition = getAvailablePosition(this, ['BUILDING']);
                            this.x = BOT_getAvailablePosition.x;
                            this.y = BOT_getAvailablePosition.y;
                            this.color = 'green';
                            break;
                        default:
                            break;
                    }
                    append(this.container, /*html*/`
                            <style class='${this.id}'></style>
                            <style>
                                ${this.id} {
                                    border-radius: ${this.borderRadius}%;
                                    background: ${this.color};
                                    width: ${this.dim}%;
                                    height: ${this.dim}%;
                                }
                            </style>
                            <${this.id} class='abs'></${this.id}>
                    `);
                    switch (this.type) {
                        case 'USER_MAIN':
                            if (this.ArrowLeft) stopListenKey(this.ArrowLeft);
                            this.ArrowLeft = startListenKey({
                                key: 'ArrowLeft',
                                vel: this.vel,
                                onKey: () => {
                                    this.y--;
                                    this.y = validatePosition(this.y);
                                }
                            });
                            if (this.ArrowRight) stopListenKey(this.ArrowRight);
                            this.ArrowRight = startListenKey({
                                key: 'ArrowRight',
                                vel: this.vel,
                                onKey: () => {
                                    this.y++;
                                    this.y = validatePosition(this.y);
                                }
                            });
                            if (this.ArrowUp) stopListenKey(this.ArrowUp);
                            this.ArrowUp = startListenKey({
                                key: 'ArrowUp',
                                vel: this.vel,
                                onKey: () => {
                                    this.x--;
                                    this.x = validatePosition(this.x);
                                }
                            });
                            if (this.ArrowDown) stopListenKey(this.ArrowDown);
                            this.ArrowDown = startListenKey({
                                key: 'ArrowDown',
                                vel: this.vel,
                                onKey: () => {
                                    this.x++;
                                    this.x = validatePosition(this.x);
                                }
                            });
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
                    switch (this.type) {
                        case 'BOT':
                            if (this.path.length === 0) {





                                // console.table(matrix);
                                // this.path.push({});

                                const { x, y, matrix } = getAvailablePosition(this, ['BUILDING']);

                                const grid = new PF.Grid(matrix.length, matrix.length, matrix);
                                const finder = new PF.AStarFinder({
                                    allowDiagonal: false,
                                    dontCrossCorners: false,
                                    heuristic: PF.Heuristic.chebyshev
                                });
                                this.path = finder.findPath(this.y, this.x, x, y, grid);


                                // console.log('this.path', this.path);
                                // this.path.push({});

                            }
                            if (this.path[0]) {
                                this.x = parseInt(this.path[0][1]);
                                this.y = parseInt(this.path[0][0]);
                                this.path.shift();
                            }

                            break;
                        case 'BOT_BUG':

                            random(0, 1) === 0 ? this.x = this.x + 0.2 : this.x = this.x - 0.2;
                            random(0, 1) === 0 ? this.y = this.y + 0.2 : this.y = this.y - 0.2;
                            this.x = validatePosition(this.x);
                            this.y = validatePosition(this.y);

                            break;
                        default:
                            break;
                    }
                    htmls(`.${this.id}`,/*css*/`
                        ${this.id} {
                            top: ${this.x - (this.dim / 2)}%;
                            left: ${this.y - (this.dim / 2)}%;
                            ${(this.type != 'BUILDING') &&

                            elements.filter(x => (

                                validateCollision(x, this)
                                &&
                                this.id != x.id
                            )).length > 0 ? 'background: magenta !important;' : ''}
            }
                `);
                }
            };
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        setTimeout(() => {

            elements = elements.concat(
                range(0, 2)
                    .map(() => gen().init({
                        container: containerID,
                        type: 'BUILDING',
                        matrix: { x: 3, y: 4 }
                    }))
            );
            elements = elements.concat(
                [
                    gen().init({
                        container: containerID,
                        type: 'USER_MAIN',
                        matrix: { x: 2, y: 2 }
                    }),
                    gen().init({
                        container: containerID,
                        type: 'BOT'
                    }),
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
            this.loopGame = setInterval(() => renderGame());

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
                </style>
                <${containerID} class='in'></${containerID}>
            </div>
        
        `
    }

};