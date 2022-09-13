
this.cloud = {

    init: function () {



        const idDropArea = 'x' + s4();
        const clearInput = 'x' + s4();
        const idDropZoneInput = 'x' + s4();
        const idStyleOnDragZone = 'x' + s4();

        setTimeout(() => {


            const dropzone = s('.' + idDropArea);
            const dropzoneInput = s('.' + idDropZoneInput);
            const multiple = dropzoneInput.getAttribute('multiple') ? true : false;

            s('.' + clearInput).onclick = () => {
                dropzoneInput.value = null;
            };

            ['drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'].forEach(function (event) {
                dropzone.addEventListener(event, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            dropzone.addEventListener('dragover', function (e) {
                this.classList.add(idStyleOnDragZone);
            }, false);

            dropzone.addEventListener('dragleave', function (e) {
                this.classList.remove(idStyleOnDragZone);
            }, false);

            dropzone.addEventListener('drop', function (e) {
                this.classList.remove(idStyleOnDragZone);
                let files = e.dataTransfer.files;
                let dataTransfer = new DataTransfer();

                let contFiles = 0;
                Array.prototype.forEach.call(files, file => {
                    if (!multiple && contFiles == 1) return;
                    dataTransfer.items.add(file);
                    contFiles++;
                });

                const filesToBeAdded = dataTransfer.files;
                dropzoneInput.files = filesToBeAdded;
                dropzoneInput.onchange({ target: dropzoneInput });

            }, false);

            dropzone.addEventListener('click', function (e) {
                dropzoneInput.click();
            });

            dropzoneInput.onchange = e => {
                console.log('input file onchange', e.target.files);

                Object.keys(e.target.files).forEach((fileAttr, currentIndex) => {
                    const read = new FileReader();
                    const currentFile = e.target.files[fileAttr];
                    read.readAsBinaryString(currentFile);
                    read.onloadend = () => {
                        console.log(currentFile, currentIndex, read.result);
                        console.log('-----');
                    };
                });

                // let body = new FormData();
                // body.append(s4(), new File([new Blob([s('.' + this[IDS][0]).value])], 'f' + s4() + '.js'));
                // const url = () => `${buildBaseApiUri()}/api/${apiUploader}`;
                // const method = 'POST';
                // const headers = {
                //     'Authorization': renderAuthBearer()
                //     // 'Content-Type': 'application/json',
                //     // 'content-type': 'application/octet-stream'
                //     //  'content-length': CHUNK.length,
                // };
                // body.append('indexFolder', '2');
                // body.append('title', s('.' + this[IDS][4]).value);
                // body.append('public', s('.' + this[IDS][7]).checked);
                // const requestResult = await serviceRequest(url, {
                //     method,
                //     headers,
                //     body, // : method == 'GET' ? undefined : JSON.stringify(body)
                // });

            };





        });

        return /*html*/`

                <div class='in container title'> cloud </div>    
                
                <style>
                    .drop-area {
                        height: 200px;
                        background: #404040;
                        color: white !important;
                    }
                    .${idStyleOnDragZone} {
                        background: black;
                        transition: .3s;
                    }
                </style>

                <div class='in container'>
                    <input class='${idDropZoneInput}' type='file' multiple='multiple'>
                    <button class='${clearInput}'>${renderLang({ es: 'Limpiar', en: 'Clear' })}</button>
                </div>

                <div class='in container drop-area ${idDropArea}'>
                    <div class='abs center'>
                            <i class='fas fa-cloud' style='font-size: 40px; color: white !important; cursor: default'></i>
                            <br>
                            ${renderLang({ en: 'Drop File', es: 'Soltar archivo' })}
                    </div>
                </div>
        
        `
    }
};