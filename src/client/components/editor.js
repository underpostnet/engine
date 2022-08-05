this.editor = {
    init: function () {
        const IDS = s4();
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
                append(this[IDS][4], /*html*/`
                <div class='in container'>
                    ${tinymce.activeEditor.getContent()}
                </div>
                `);


                // error this[IDS][5]




                let body = new FormData();


                body.append(s4(), new File([new Blob([tinymce.activeEditor.getContent()])], s4() + '.html'));


                const url = () => './api/uploader';
                const method = 'POST';
                const headers = {
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };

                console.log('init fetch body:', body);


                (async () => {

                    const requestResult = await serviceRequest(url, {
                        method,
                        // headers,
                        body, // : method == 'GET' ? undefined : JSON.stringify(body)
                    });

                    console.log('request', requestResult);

                    tinyMCE.activeEditor.setContent('');

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
           </div>             
        `
    }
};