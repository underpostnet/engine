



const renderInput = (_this, name, matrix, customValidator, options) => {

    let labelInputs = [matrix[0]];
    let inputValueContent = [matrix[1]];
    let errorsIdInput = [matrix[2]];

    const renderMsgInput = (ID, MSG, STATUS) => {
        htmls('.' + _this[ID], (STATUS ? sucessIcon : errorIcon) + MSG);
        fadeIn(s('.' + _this[ID]));
    };

    const successEndInput = (i, inputId) => {
        s('.' + _this[errorsIdInput[i]]).style.display = 'none';
        return true;
    };

    const checkInput = (i, inputId) => {
        if (s('.' + _this[inputId]).value == '') {
            s('.' + _this[labelInputs[i]]).style.top = topLabelInput;
            renderMsgInput(errorsIdInput[i], renderLang({ es: 'Campo vacio', en: 'Empty Field' }));
            return false;
        } else {
            s('.' + _this[labelInputs[i]]).style.top = botLabelInput;
        }
        if (options && options.onlyEmpty)
            return successEndInput(i, inputId);
        if (options && options.type == 'password') {
            const testPassword = passwordValidator(s('.' + _this[inputId]).value);
            if (!testPassword.validate) {
                renderMsgInput(errorsIdInput[i], testPassword.msg);
                return false;
            }
        }
        if (options && options.type == 'email') {
            const testEmail = emailValidator(s('.' + _this[inputId]).value);
            if (!testEmail.validate) {
                renderMsgInput(errorsIdInput[i], testEmail.msg);
                return false;
            }
        }
        if (customValidator && customValidator(inputId, errorsIdInput[i]) == false) {
            return false;
        }
        const maxChars = (options && options.valueLength ? options.valueLength : 28);
        if (s('.' + _this[inputId]).value.length > maxChars) {
            renderMsgInput(errorsIdInput[i], renderLang({ es: `Supera los ${maxChars} caracteres`, en: `Exceed ${maxChars} characters` }));
            return false;
        }
        return successEndInput(i, inputId);
    };

    const checkAllInput = (setEvent) => inputValueContent.map((inputId, i) => {
        if (setEvent) {
            s('.' + _this[inputId]).onblur = () =>
                checkInput(i, inputId);
            s('.' + _this[inputId]).oninput = () =>
                checkInput(i, inputId);
            s('.' + _this[labelInputs[i]]).onclick = () =>
                s('.' + _this[inputId]).focus();
            s('.' + _this[inputId]).onclick = () =>
                s('.' + _this[labelInputs[i]]).style.top = botLabelInput;
            s('.' + _this[inputId]).onfocus = () =>
                s('.' + _this[labelInputs[i]]).style.top = botLabelInput;
            return;
        };
        return s('.' + _this[inputId]).oninput();
    }).filter(x => x == false).length === 0;

    setTimeout(() => checkAllInput(true));

    return /*html*/`
            <label class='in ${_this[matrix[0]]}' style='top: ${topLabelInput};'>
                ${name}
            </label>
            <input class='in ${_this[matrix[1]]}' 
            type='${options && options.type ? options.type : 'text'}'            
            autocomplete='${options && options.autocomplete ? options.autocomplete : 'off'}'>
            <div class='in error-input ${_this[matrix[2]]}'></div>
        `

};

const validateSubmitInput = (inputId, errorId) => {
    s('.' + inputId).oninput();
    return s('.' + errorId).style.display == 'block';
};

const clearInput = (_this, matrix) => {
    s('.' + _this[matrix[0]]).style.top = topLabelInput;
    s('.' + _this[matrix[1]]).value = '';
    s('.' + _this[matrix[2]]).style.display = 'none';
};

const setValueInput = (_this, matrix, value) => {
    s('.' + _this[matrix[0]]).style.top = botLabelInput;
    s('.' + _this[matrix[1]]).value = value;
    s('.' + _this[matrix[2]]).style.display = 'none';
};

const renderFilesInput = (options) => {

    const idDropArea = 'x' + s4();
    const clearInput = options.clearInputSelector ? options.clearInputSelector : 'x' + s4();
    const idDropZoneInput = 'x' + s4();
    const idStyleOnDragZone = 'x' + s4();
    const dropAreaStyle = 'x' + s4();

    setTimeout(() => {


        const dropzone = s('.' + idDropArea);
        const dropzoneInput = s('.' + idDropZoneInput);
        const multiple = dropzoneInput.getAttribute('multiple') ? true : false;

        s('.' + clearInput).onclick = (e) => {
            e.preventDefault();
            dropzoneInput.value = null;
            if (options && options.clear) options.clear();
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

            if (options && options.onchange) return options.onchange(e.target.files);

            // Object.keys(e.target.files).forEach((fileAttr, currentIndex) => {
            //     const read = new FileReader();
            //     const currentFile = e.target.files[fileAttr];
            //     read.readAsBinaryString(currentFile);
            //     read.onloadend = () => {
            //         console.log(currentFile, currentIndex, read.result);
            //         console.log('-----');
            //     };
            // });

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

            <style>
                .${dropAreaStyle} {
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

            <div class='in container ${dropAreaStyle} ${idDropArea}'>
                <div class='abs center'>
                        <i class='fas fa-cloud' style='font-size: 40px; color: white !important; cursor: default'></i>
                        <br>
                        ${renderLang({ en: 'Drop File', es: 'Soltar archivo' })}
                </div>
            </div>
    
    `
}