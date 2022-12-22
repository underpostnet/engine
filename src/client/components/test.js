

this.test = {

    init: function () {

        const id = () => 'x' + s4();
        const containerID = id();

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        const user = {
            init: function (options) {
                this.id = id();
                this.x = random(0, 100);
                this.y = random(0, 100);
                this.container = options.container;
                this.vel = 10;
                append(this.container, /*html*/`
                        <style class='${this.id}'></style>
                        <style>
                            ${this.id} {
                                border-radius: 100%;
                                background: red;
                                width: 40px;
                                height: 40px;
                            }
                        </style>
                        <${this.id} class='abs'></${this.id}>
                `);
                if (this.ArrowLeft) stopListenKey(this.ArrowLeft);
                this.ArrowLeft = startListenKey({
                    key: 'ArrowLeft',
                    vel: this.vel,
                    onKey: () => {
                        this.y--;
                    }
                });
                if (this.ArrowRight) stopListenKey(this.ArrowRight);
                this.ArrowRight = startListenKey({
                    key: 'ArrowRight',
                    vel: this.vel,
                    onKey: () => {
                        this.y++;
                    }
                });
                if (this.ArrowUp) stopListenKey(this.ArrowUp);
                this.ArrowUp = startListenKey({
                    key: 'ArrowUp',
                    vel: this.vel,
                    onKey: () => {
                        this.x--;
                    }
                });
                if (this.ArrowDown) stopListenKey(this.ArrowDown);
                this.ArrowDown = startListenKey({
                    key: 'ArrowDown',
                    vel: this.vel,
                    onKey: () => {
                        this.x++;
                    }
                });
                return this;
            },
            loop: function () {
                htmls(`.${this.id}`,/*css*/`
                    ${this.id} {
                        top: ${this.x}%;
                        left: ${this.y}%;
                    }
                `);
            }
        };

        // ----------------------------------------------------------------
        // ----------------------------------------------------------------

        setTimeout(() => {

            this.elements = [
                user.init({
                    container: containerID
                })
            ];

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
                        height: 350px;
                        width: 350px;
                        background: gray;
                    }
                </style>
                <${containerID} class='in'></${containerID}>
            </div>
        
        `
    }

};