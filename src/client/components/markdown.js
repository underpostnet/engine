this.markdown = {
    init: function () {
        const IDS = s4();
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

                body.append(s4(), new File([new Blob([markedContent])], s4() + '.md'));


                const url = () => '/api/uploader';
                const method = 'POST';
                const headers = {
                    'Authorization': renderAuthBearer()
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };

                body.append('indexFolder', '1');

                console.log('init fetch body:', body);


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
                        GLOBAL['current-view-content'].component = 'markdown';
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
        </div>
        `
    }
};