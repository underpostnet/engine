

this.test = {

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
                    switch (this.type) {
                        case 'building':
                            this.color = 'black';
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
                                    border-radius: 100%;
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


                                // const matrix = range(0, 100).map(x => {
                                //     return range(0, 100).map(y => {
                                //         return 0;
                                //     });
                                // });

                                // console.log('matrix', matrix.length, matrix[0].length);

                                // const grid = new PF.Grid(101, 101, [0, 0, 1, 1]);
                                // let finder = new PF.AStarFinder(data.map.pf_options_user);
                                // let path = finder.findPath(data.users.var[0].x, data.users.var[0].y, xs, ys, grid);

                            }
                            break;
                        case 'bot-bug':

                            random(0, 1) === 0 ? this.x++ : this.x--;
                            random(0, 1) === 0 ? this.y++ : this.y--;
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
                            ${(this.type == 'user-main' || this.type == 'bot-bug') &&

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
                gen().init({
                    container: containerID,
                    type: 'bot-bug'
                }),
                gen().init({
                    container: containerID,
                    type: 'bot-bug'
                }),
                gen().init({
                    container: containerID,
                    type: 'bot-bug'
                })
            ].concat(range(0, 50)
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