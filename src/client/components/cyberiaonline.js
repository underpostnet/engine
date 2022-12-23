

this.cyberiaonline = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();
        let elements = [];


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (pos) => {
            if (pos < 0) return 0;
            if (pos > 100) return 100;
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

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const gen = () => {
            return {
                init: function (options) {
                    this.id = id();
                    this.x = random(0, 100);
                    this.y = random(0, 100);
                    this.container = options.container;
                    this.type = options.type;
                    this.vel = 10;
                    this.dim = 5;
                    this.color = 'red';
                    this.path = [];
                    this.borderRadius = 100;
                    switch (this.type) {
                        case 'building':
                            this.color = 'black';
                            this.borderRadius = 0;
                            break;
                        case 'user-main':
                            this.color = 'yellow';
                            break;
                        case 'bot':
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
                        case 'user-main':
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
                    return this;
                },
                loop: function () {
                    switch (this.type) {
                        case 'bot':
                            if (this.path.length === 0) {


                                const matrix = range(0, 100).map(x => {
                                    return range(0, 100).map(y => {
                                        return elements.filter(element =>
                                            element.type == 'building'
                                            &&
                                            validateCollision(
                                                { x: element.x, y: element.y, dim: element.dim },
                                                { x, y, dim: this.dim }
                                            )).length > 0 ? 1 : 0;
                                    });
                                });


                                // console.table(matrix);
                                // this.path.push({});

                                let desX = random(0, 100);
                                let desY = random(0, 100);

                                while (matrix[desX][desY] == 1) {
                                    desX = random(0, 100);
                                    desY = random(0, 100);
                                }

                                const grid = new PF.Grid(matrix.length, matrix.length, matrix);
                                const finder = new PF.AStarFinder({
                                    allowDiagonal: false,
                                    dontCrossCorners: false,
                                    heuristic: PF.Heuristic.chebyshev
                                });
                                this.path = finder.findPath(this.y, this.x, desY, desX, grid);


                                // console.log('this.path', this.path);
                                // this.path.push({});

                            }
                            if (this.path[0]) {
                                this.x = parseInt(this.path[0][1]);
                                this.y = parseInt(this.path[0][0]);
                                this.path.shift();
                            }

                            break;
                        case 'bot-bug':

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
                            ${(this.type != 'building') &&

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

            elements = [
                gen().init({
                    container: containerID,
                    type: 'user-main'
                }),
                gen().init({
                    container: containerID,
                    type: 'bot'
                }),
                // gen().init({
                //     container: containerID,
                //     type: 'bot-bug'
                // }),
            ].concat(range(0, 20)
                .map(() => gen().init({
                    container: containerID,
                    type: 'building'
                })));

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