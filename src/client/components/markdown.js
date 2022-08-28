this.markdown = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'markdown-' + s4());

        // let labelInputs = [1];
        // let inputValueContent = [2];
        // let errorsIdInput = [3];

        setTimeout(() => {
            marked.setOptions();

            this.instance = new SimpleMDE({ element: s('.markdown-editor') });

            s('.' + this[IDS][0]).onclick = () => {

                if (validateSubmitInput(this[IDS][3], this[IDS][4])) return;

                const markedContent = this.instance.value();
                // append(this[IDS][1], /*html*/`
                //     <div class='in container'>
                //         <div class='in markdown-css' style='background: #d9d9d9'>
                //             ${marked.parse(markedContent)}
                //         </div> 
                //     </div>               
                // `);

                let body = new FormData();
                body.append('title', s('.' + this[IDS][3]).value);
                body.append('indexFolder', '1');
                body.append('public', s('.' + this[IDS][5]).checked);

                body.append(s4(), new File([new Blob([markedContent])], 'f' + s4() + '.md'));


                const url = () => `${buildBaseApiUri()}/api/${apiUploader}`;
                const method = 'POST';
                const headers = {
                    'Authorization': renderAuthBearer()
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };

                body.append('indexFolder', '1');

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
                        this.instance.value('');
                        clearInput(this[IDS], [2, 3, 4]);
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Contenido Enviado', en: 'Saved Content' })
                        }));
                        GLOBAL['current-view-content'] = requestResult.data;
                        GLOBAL.router({ newPath: buildBaseUri() + '/view-content' });
                    } else {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: errorIcon,
                            color: 'red',
                            content: requestResult.data
                        }));
                    }


                })();



            };
        });
        return /*html*/`
        <${this[IDS][1]}></${this[IDS][1]}>
        <div class='in container'>
            ${renderInput(this[IDS], renderLang({ es: 'Titulo', en: 'Title' }), [2, 3, 4])}
        </div>
        <div class='in container' style='background: white'>
            <textarea class='markdown-editor'></textarea>
        </div>
        <div class='in container'>
            <button class='${this[IDS][0]}'>${renderLang({ es: 'Enviar', en: 'Send' })}</button>
            ${renderToggleSwitch({
            id: this[IDS][5], label: [
                renderLang({ es: `Privado`, en: `Private` }),
                renderLang({ es: `Publico`, en: `Public` })
            ]
        })}
        </div>
        `
    },
    renderView: (dataFile, rawContent) => {
        return /*html*/`
        <div class='in markdown-css' style='background: #d9d9d9'>
            ${marked.parse(rawContent)}
        </div>
        `
    },
    routerDisplay: function () {
        if (GLOBAL['current-edit-content']) {
            setValueInput(this[this.IDS], [2, 3, 4], GLOBAL['current-edit-content'].title);
            this.instance.value(GLOBAL['current-edit-content'].raw);
            this.update = newInstance(GLOBAL['current-edit-content']);
            setTimeout(() => GLOBAL['current-edit-content'] = undefined);
        } else {
            try {
                clearInput(this[this.IDS], [2, 3, 4]);
                this.update = false;
                this.instance.value('');
                if (JSON.parse(s(`.${this[this.IDS][5]}`).checked))
                    s(`.ts-container-${this[this.IDS][5]}`).click();
            } catch (error) { console.warn(error) }
        }
        if (GLOBAL['current-edit-content'] &&
            JSON.parse(s(`.${this[this.IDS][5]}`).checked) != GLOBAL['current-edit-content'].public)
            s(`.ts-container-${this[this.IDS][5]}`).click();
    }
};