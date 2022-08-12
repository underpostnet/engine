this.js_demo = {
    init: function (options) {
        // https://prismjs.com/download.html
        const IDS = s4();
        this.IDS = IDS;
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


            s('.' + this[IDS][6]).onclick = () => {


                if (validateSubmitInput(this[IDS][4], this[IDS][5])) return;
                // append(this[IDS][4], /*html*/`
                // <div class='in container'>
                //     ${tinymce.activeEditor.getContent()}
                // </div>
                // `);



                let body = new FormData();


                body.append(s4(), new File([new Blob([s('.' + this[IDS][0]).value])], s4() + '.js'));


                const url = () => '/api/uploader';
                const method = 'POST';
                const headers = {
                    'Authorization': renderAuthBearer()
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };
                body.append('indexFolder', '2');
                body.append('title', s('.' + this[IDS][4]).value);
                body.append('public', s('.' + this[IDS][7]).checked);

                if (this.update) {
                    body.append('update', JSON.stringify(this.update));
                    this.update = false;
                }


                (async () => {

                    const requestResult = await serviceRequest(url, {
                        method,
                        headers,
                        body, // : method == 'GET' ? undefined : JSON.stringify(body)
                    });

                    console.log('request', requestResult);

                    if (requestResult.status == 'success') {
                        s('.' + this[IDS][0]).value = '';
                        clearInput(this[IDS], [3, 4, 5]);
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Contenido Enviado', en: 'Saved Content' })
                        }));
                        GLOBAL['current-view-content'] = requestResult.data;
                        GLOBAL.router({ newPath: '/engine/view-content' });
                    } else {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: errorIcon,
                            color: 'red',
                            content: requestResult.data
                        }));
                    }

                })();
            }


            (async () => {
                if (options && options.mode == 'home_example') {
                    GLOBAL['current-edit-content'] = {
                        'static': '/js-demo/e5cd.js',
                        'title': 'Padding Color',
                        'date': '2022-08-12T03:14:14.625Z',
                        'component': 'js_demo',
                        'public': true,
                        'raw': await serviceRequest(() => `/uploads/js-demo/e5cd.js`)
                    };
                    this.routerDisplay();
                }
            })();

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
            <div class='in container' style='${options && options.mode == 'home_example' ? 'display: none' : ''}'>
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
            <div class='in container' style='${options && options.mode == 'home_example' ? 'display: none' : ''}'>
                <button class='${this[IDS][6]}'>${renderLang({ es: 'Enviar', en: 'Send' })}</button>
                ${renderToggleSwitch({
            id: this[IDS][7], label: [
                renderLang({ es: `Privado`, en: `Private` }),
                renderLang({ es: `Publico`, en: `Public` })
            ]
        })}
            </div>   
        `
    },
    renderView: (dataFile, rawContent) => {
        const idDemo = `demo-${s4()}`;
        const contentEval = rawContent.replaceAll(`'body'`, `'${idDemo}'`);
        const displayJS = contentEval.replaceAll(`'${idDemo}'`, `'body'`);
        setTimeout(() => eval(contentEval));
        return /*html*/`
            <${idDemo}></${idDemo}>
            <pre  class='in container'><code>${Prism.highlight(displayJS, Prism.languages.javascript, 'javascript')}</pre></code>            
        `;
    },
    routerDisplay: function () {
        if (GLOBAL['current-edit-content']) {
            setValueInput(this[this.IDS], [3, 4, 5], GLOBAL['current-edit-content'].title);
            s('.' + this[this.IDS][0]).value = GLOBAL['current-edit-content'].raw;
            s('.' + this[this.IDS][0]).oninput();
            this.update = newInstance(GLOBAL['current-edit-content']);
            setTimeout(() => GLOBAL['current-edit-content'] = undefined);
        } else {
            try {
                clearInput(this[this.IDS], [3, 4, 5]);
                s('.' + this[this.IDS][0]).value = '';
                s('.' + this[this.IDS][0]).oninput();
                this.update = false;
                if (JSON.parse(s(`.${this[this.IDS][7]}`).checked))
                    s(`.ts-container-${this[this.IDS][7]}`).click();
            } catch (error) { console.warn(error) }
        }
        if (GLOBAL['current-edit-content'] &&
            JSON.parse(s(`.${this[this.IDS][7]}`).checked) != GLOBAL['current-edit-content'].public)
            s(`.ts-container-${this[this.IDS][7]}`).click();
    }
};


