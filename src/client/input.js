const passwordValidator = str => {

    let msg = '';
    let validate = true;
    let regex;

    if (str.length < 8) {
        validate = false;
        msg += ' >' + renderLang({ es: 'charLength', en: 'charLength' });
    }

    regex = /^(?=.*[a-z]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += '>' + renderLang({ es: 'lowercase', en: 'lowercase' });
    }

    regex = /^(?=.*[A-Z]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += ' >' + renderLang({ es: 'uppercase', en: 'uppercase' });
    }

    regex = /^(?=.*[0-9_\W]).+$/;
    if (!regex.test(str)) {
        validate = false;
        msg += ' >' + renderLang({ es: 'number or special', en: 'number or special' });
    }

    return {
        msg,
        validate
    }
};


const renderInput = (_this, name, matrix, customValidator, options) => {

    let labelInputs = [matrix[0]];
    let inputValueContent = [matrix[1]];
    let errorsIdInput = [matrix[2]];

    const renderMsgInput = (ID, MSG, STATUS) => {
        htmls('.' + _this[ID], (STATUS ? sucessIcon : errorIcon) + MSG);
        fadeIn(s('.' + _this[ID]));
    };

    const checkInput = (i, inputId) => {
        if (s('.' + _this[inputId]).value == '') {
            s('.' + _this[labelInputs[i]]).style.top = topLabelInput;
            renderMsgInput(errorsIdInput[i], renderLang({ es: 'Campo vacio', en: 'Empty Field' }));
            return false;
        }
        if (customValidator !== undefined && customValidator(inputId, errorsIdInput[i]) == false) {
            return false;
        }
        if (options && options.type == 'password') {
            const testPassword = passwordValidator(s('.' + _this[inputId]).value);
            if (!testPassword.validate) {
                renderMsgInput(errorsIdInput[i], testPassword.msg);
                return false;
            }
        }
        s('.' + _this[labelInputs[i]]).style.top = botLabelInput;
        s('.' + _this[errorsIdInput[i]]).style.display = 'none';
        return true;
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