

this.test = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const validatePosition = (pos) => {
            if (pos < 0) return 0;
            if (pos > 100) return 100;
            return pos;
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
                    switch (this.type) {
                        case 'building':
                            this.color = 'black';
                            break;
                        case 'main-user':
                            this.color = 'yellow';
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
                        case 'main-user':
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
                        }
                    `);
                }
            };
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        setTimeout(() => {

            this.elements = [
                gen().init({
                    container: containerID,
                    type: 'main-user'
                }),
                gen().init({
                    container: containerID,
                    type: 'bot'
                }),
                gen().init({
                    container: containerID,
                    type: 'bot'
                })
            ].concat(range(0, 30)
                .map(() => gen().init({
                    container: containerID,
                    type: 'building'
                })));

            console.log('thia.elements', this.elements);

            if (this.loopGame) clearInterval(this.loopGame);
            const renderGame = () => this.elements.map(x => x.loop());
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