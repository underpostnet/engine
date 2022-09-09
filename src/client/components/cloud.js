
this.cloud = {

    init: function () {



        const idDropArea = 'x' + s4();

        setTimeout(() => {


            const dropzone = s('.' + idDropArea);
            const dropzoneInput = s('.dropzone-input');
            const multiple = dropzoneInput.getAttribute('multiple') ? true : false;

            ['drag', 'dragstart', 'dragend', 'dragover', 'dragenter', 'dragleave', 'drop'].forEach(function (event) {
                dropzone.addEventListener(event, function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });

            dropzone.addEventListener('dragover', function (e) {
                this.classList.add('dropzone-dragging');
            }, false);

            dropzone.addEventListener('dragleave', function (e) {
                this.classList.remove('dropzone-dragging');
            }, false);

            dropzone.addEventListener('drop', function (e) {
                this.classList.remove('dropzone-dragging');
                let files = e.dataTransfer.files;
                let dataTransfer = new DataTransfer();

                let for_alert = "";
                Array.prototype.forEach.call(files, file => {
                    for_alert += "# " + file.name +
                        " (" + file.type + " | " + file.size +
                        " bytes)\r\n";
                    dataTransfer.items.add(file);
                    if (!multiple) {
                        return false;
                    }
                });

                const filesToBeAdded = dataTransfer.files;
                dropzoneInput.files = filesToBeAdded;
                dropzoneInput.onchange({ target: { files: dropzoneInput.files } });

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
                        // console.log(currentFile, currentIndex, read.result);
                        // console.log('-----');
                    };
                });

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
                </style>

                <div class='in container'>
                    <input class='dropzone-input' type='file' multiple='multiple'>
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