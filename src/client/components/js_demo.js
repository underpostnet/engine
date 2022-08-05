this.js_demo = {
    init: function () {
        // https://prismjs.com/download.html
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'js_demo-' + s4());
        setTimeout(() => {

            const liveJS = () => {


                const idDemo = `demo-${s4()}`;
                const contentEval = s('.' + this[IDS][0]).value.replaceAll(`'body'`, `'${idDemo}'`);
                const displayJS = contentEval.replaceAll(`'${idDemo}'`, `'body'`);

                setTimeout(() => {
                    try {
                        eval(contentEval);
                        s('.' + this[IDS][2]).style.display = 'none';
                    } catch (error) {
                        htmls('.' + this[IDS][2], errorIcon + error.message);
                        fadeIn(s('.' + this[IDS][2]));
                    }
                });

                htmls(this[IDS][1], /*html*/`
                       <div class='fl'>
                            <div class='in fll js_demo_cell'>
                                <div class='in container title'>
                                    CODE
                                </div>
                                <pre  class='in container'><code>${Prism.highlight(displayJS, Prism.languages.javascript, 'javascript')}</pre></code>
                                <div class='in error-input ${this[IDS][2]}'></div>
                            </div>
                            <div class='in fll js_demo_cell'>
                                <div class='in container title'>
                                    DEMO
                                </div>
                                <div class='in container'>
                                    <${idDemo}></${idDemo}>
                                </div>
                            </div>
                        </div>
                `);
            };

            s('.' + this[IDS][0]).onblur = () =>
                liveJS();
            s('.' + this[IDS][0]).oninput = () =>
                liveJS();


        });
        return /*html*/`
        <style>
            .js_demo_textarea {
                min-height: 200px;
                width: 95%;
            }
            .js_demo_cell {
                overflow: auto;
            }
        </style>
        ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                .js_demo_cell {
                    width: 100%;
                }
            `},
            {
                limit: 1000,
                css: /*css*/`
                .js_demo_cell {
                    width: 50%;
                }
            `}
        ])}
            <div class='in container'>
                ${renderInput(this[IDS], renderLang({ es: 'Titulo', en: 'Title' }), [3, 4, 5])}
            </div>
            <div class='in container'>    
                <${this[IDS][1]}></${this[IDS][1]}>
            </div>
            <div class='in container title'>
                LIVE CODE
            </div>
            <div class='in container'>
                <textarea class='in js_demo_textarea ${this[IDS][0]}' placeholder='Code...'></textarea>
            </div>
            <div class='in container'>
                <button class='${this[IDS][6]}'>${renderLang({ es: 'Enviar', en: 'Send' })}</button>
            </div>   
        `
    }
};


