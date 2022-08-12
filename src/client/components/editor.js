this.editor = {
    init: function () {
        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'editor-' + s4());

        // let url = () => `/api/${uriApi}/create-key`;
        // let method = 'POST';

        setTimeout(() => {

            tinymce.init({
                selector: 'textarea#my-expressjs-tinymce-app',
                min_height: 400,
                menubar: true,
                plugins: [
                    'advlist',
                    'anchor',
                    'autolink',
                    'autoresize',
                    'autosave',
                    'charmap',
                    'code',
                    'codesample',
                    'directionality',
                    'emoticons',
                    'fullscreen',
                    'help',
                    'image',
                    'importcss',
                    'insertdatetime',
                    'link',
                    'lists',
                    'media',
                    'nonbreaking',
                    'pagebreak',
                    'preview',
                    'quickbars',
                    'save',
                    'searchreplace',
                    'table',
                    'template',
                    'visualblocks',
                    'visualchars',
                    'wordcount'
                ],
                toolbar: 'undo redo | casechange blocks | bold italic backcolor | ' +
                    'alignleft aligncenter alignright alignjustify | ' +
                    'bullist numlist checklist outdent indent | removeformat | a11ycheck code table help'
            });

            s('.' + this[IDS][0]).onclick = () => {


                if (validateSubmitInput(this[IDS][2], this[IDS][3])) return;
                // append(this[IDS][4], /*html*/`
                // <div class='in container'>
                //     ${tinymce.activeEditor.getContent()}
                // </div>
                // `);



                let body = new FormData();


                body.append(s4(), new File([new Blob([tinymce.activeEditor.getContent()])], s4() + '.html'));


                const url = () => '/api/uploader';
                const method = 'POST';
                const headers = {
                    'Authorization': renderAuthBearer()
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };
                body.append('indexFolder', '0');
                body.append('title', s('.' + this[IDS][2]).value);
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
                        tinyMCE.activeEditor.setContent('');
                        clearInput(this[IDS], [1, 2, 3]);
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Contenido Enviado', en: 'Saved Content' })
                        }));
                        GLOBAL['current-view-content'] = requestResult.data;
                        GLOBAL.router({ newPath: '/' + viewMetaData.clientID + '/view-content' });
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


        });
        return /*html*/`
           <style>
           </style>
           <${this[IDS][4]}></${this[IDS][4]}>
           <div class='in container'>
                ${renderInput(this[IDS], renderLang({ es: 'Titulo', en: 'Title' }), [1, 2, 3])}
           </div>
           <div class='in container'>
                <textarea id='my-expressjs-tinymce-app'></textarea>
           </div>
           <div class='in container'>
                <div class='in error-input ${this[IDS][5]}'></div>
                <div class='in success-input ${this[IDS][6]}'></div>
           </div>
           <div class='in container'>
                <button class='${this[IDS][0]}'>${renderLang({ es: 'Enviar', en: 'Send' })}</button>
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
        return rawContent
    },
    routerDisplay: function () {
        if (GLOBAL['current-edit-content']) {
            setValueInput(this[this.IDS], [1, 2, 3], GLOBAL['current-edit-content'].title);
            tinyMCE.activeEditor.setContent(GLOBAL['current-edit-content'].raw);
            this.update = newInstance(GLOBAL['current-edit-content']);
            setTimeout(() => GLOBAL['current-edit-content'] = undefined);
        } else {
            try {
                clearInput(this[this.IDS], [1, 2, 3]);
                this.update = false;
                tinyMCE.activeEditor.setContent('');
                if (JSON.parse(s(`.${this[this.IDS][7]}`).checked))
                    s(`.ts-container-${this[this.IDS][7]}`).click();
            } catch (error) { console.warn(error) }
        }
        if (GLOBAL['current-edit-content'] &&
            JSON.parse(s(`.${this[this.IDS][7]}`).checked) != GLOBAL['current-edit-content'].public)
            s(`.ts-container-${this[this.IDS][7]}`).click();
    }
};