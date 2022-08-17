
this.form_key = {
    init: function (options) {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'form_key-' + s4());
        let labelInputs = [8, 9];
        let inputValueContent = [7, 0];
        let errorsIdInput = [6, 5];
        let url = () => `${buildBaseApiUri()}/api/${uriApi}/create-key`;
        let method = 'POST';

        const mode = options && options.mode ? options.mode : 'default';
        const errorMsgService =
            renderLang({ es: 'Error en el Servicio', en: 'Service Error' });

        setTimeout(() => {

            const renderMsgInput = (ID, MSG, STATUS) => {
                htmls('.' + this[IDS][ID], (STATUS ? sucessIcon : errorIcon) + MSG);
                fadeIn(s('.' + this[IDS][ID]));
            };

            const checkInput = (i, inputId) => {
                if (s('.' + this[IDS][inputId]).value == '') {
                    s('.' + this[IDS][labelInputs[i]]).style.top = topLabelInput;
                    renderMsgInput(errorsIdInput[i], renderLang({ es: 'Campo vacio', en: 'Empty Field' }));
                    return false;
                }
                s('.' + this[IDS][labelInputs[i]]).style.top = botLabelInput;
                s('.' + this[IDS][errorsIdInput[i]]).style.display = 'none';
                return true;
            };

            const checkAllInput = (setEvent) => inputValueContent.map((inputId, i) => {
                if (setEvent) {
                    s('.' + this[IDS][inputId]).onblur = () =>
                        checkInput(i, inputId);
                    s('.' + this[IDS][inputId]).oninput = () =>
                        checkInput(i, inputId);
                    s('.' + this[IDS][labelInputs[i]]).onclick = () =>
                        s('.' + this[IDS][inputId]).focus();
                    s('.' + this[IDS][inputId]).onclick = () =>
                        s('.' + this[IDS][labelInputs[i]]).style.top = botLabelInput;
                    s('.' + this[IDS][inputId]).onfocus = () =>
                        s('.' + this[IDS][labelInputs[i]]).style.top = botLabelInput;
                    return;
                };
                return s('.' + this[IDS][inputId]).oninput();
            }).filter(x => x == false).length === 0;

            const displayHashInput = () => {
                fadeIn(s('.' + this[IDS][8]));
                fadeIn(s('.' + this[IDS][7]));
            };
            const generateIdHashInput = () => {
                s('.' + this[IDS][7]).value = getHash();
                s('.' + this[IDS][7]).oninput();
            };

            const resetInputs = () => {
                s('.' + this[IDS][3]).style.display = 'none';
                mode == 'search' ? fadeIn(s('.' + this[IDS][4])) : fadeIn(s('.' + this[IDS][15]));
                [12, 5, 6, 11].map(errorId => s('.' + this[IDS][errorId]).style.display = 'none');
                inputValueContent.map((inputId, i) => {
                    s('.' + this[IDS][inputId]).value = '';
                    s('.' + this[IDS][labelInputs[i]]).style.top = topLabelInput;
                });
                if (mode == 'default') generateIdHashInput();
            };

            const displayCopyData = (res) => {
                if (typeof res.data === 'object') {
                    res.data = JSON.stringify(res.data, null, 4);
                }
                htmls('.' + this[IDS][27], res.data);
                fadeIn(s('.' + this[IDS][4]));
                fadeIn(s('.' + this[IDS][27]));
                fadeIn(s('.' + this[IDS][28]), 'inline-table');
                s('.' + this[IDS][3]).style.display = 'none';
                s('.' + this[IDS][28]).onclick = e => {
                    e.preventDefault();
                    copyData(res.data);
                    renderMsgInput(12, renderLang({ es: 'Llaves copiadas con exito', en: 'Successfully copied Key' }), true);
                };
                return s('.' + this[IDS][28]).click();
            };

            const displayErrorActionKey = (res, msg) => {
                s('.' + this[IDS][3]).style.display = 'none';
                fadeIn(s('.' + this[IDS][4]));
                if (res.codeStatus == 400) {
                    return renderMsgInput(11, res.data);
                }
                return renderMsgInput(11, (msg ? msg : res.data));
            }

            checkAllInput(true);
            generateIdHashInput();

            switch (mode) {
                case 'search':
                    [13, 9, 0, 5, 16].map(ID => s('.' + this[IDS][ID]).style.display = 'none');
                    htmls('.' + this[IDS][1], renderLang({ es: 'Buscar', en: 'Search' }));
                    htmls('.' + this[IDS][14], renderLang({ es: 'Buscar llave Asimetrica', en: 'Search Asymmetric key' }));
                    s('.' + this[IDS][7]).value = '';
                    s('.' + this[IDS][7]).disabled = false;
                    s('.' + this[IDS][8]).style.top = topLabelInput;
                    displayHashInput();
                    labelInputs = [8];
                    inputValueContent = [7];
                    errorsIdInput = [6];
                    url = () => `${buildBaseApiUri()}/api/${uriApi}/` + s('.' + this[IDS][7]).value;
                    method = 'GET';
                    break;
                case 'copy-cyberia-key':
                    [13, 16].map(ID => s('.' + this[IDS][ID]).style.display = 'none');
                    [18, 19].map(ID => fadeIn(s('.' + this[IDS][ID])));
                    displayHashInput();
                    labelInputs.push(18);
                    inputValueContent.push(19);
                    errorsIdInput.push(20);
                    checkAllInput(true);
                    htmls('.' + this[IDS][1], renderLang({ es: 'Generar Copia', en: 'Generate Copy' }));
                    s('.' + this[IDS][7]).value = options.data['Hash ID'];
                    htmls('.' + this[IDS][14], renderLang({ es: 'Copiar Llave Publica para Cyberia Online', en: 'Copy Public Key for Cyberia Online' }));
                    url = () => `${buildBaseApiUri()}/api/${uriApi}/copy-cyberia`;
                    break;
                case 'link-item-cyberia':
                    [13, 16].map(ID => s('.' + this[IDS][ID]).style.display = 'none');
                    [21, 22, 24, 25].map(ID => fadeIn(s('.' + this[IDS][ID])));
                    labelInputs.push(21);
                    inputValueContent.push(22);
                    errorsIdInput.push(23);
                    labelInputs.push(24);
                    inputValueContent.push(25);
                    errorsIdInput.push(26);
                    displayHashInput();
                    checkAllInput(true);
                    htmls('.' + this[IDS][1], renderLang({ es: 'Transferir', en: 'Transfer' }));
                    s('.' + this[IDS][7]).value = options.data['Hash ID'];
                    htmls('.' + this[IDS][14], renderLang({ es: 'Vincular Ítem de Cyberia en LLave Pública', en: 'Link Cyberia Item to Public Key' }));
                    url = () => `${buildBaseApiUri()}/api/${uriApi}/transaction/cyberia-link-item`;
                    break;
                case 'copy-cli-key':
                    [1, 16].map(ID => s('.' + this[IDS][ID]).style.display = 'none');
                    [28].map(ID => fadeIn(s('.' + this[IDS][ID]), 'inline-table'));
                    s('.' + this[IDS][7]).value = options.data['Hash ID'];
                    htmls('.' + this[IDS][14], renderLang({ es: 'Copiar Llaves para CLI', en: 'Copy Keys for CLI' }));
                    displayHashInput();
                    s('.' + this[IDS][28]).onclick = e => {
                        e.preventDefault();
                        s('.' + this[IDS][1]).click();
                        // si ya fue obtenido simplemente copiar
                    };
                    url = () => `${buildBaseApiUri()}/api/${uriApi}/copy-cli-key`;
            }

            s('.' + this[IDS][10]).onclick = e => setTimeout(() => resetInputs());
            s('.' + this[IDS][1]).onclick = e => {
                e.preventDefault();
                console.log('onclick', s('.' + this[IDS][0]).value);
                if (!checkAllInput()) return;
                s('.' + this[IDS][2]).style.display = 'none';
                s('.' + this[IDS][4]).style.display = 'none';
                s('.' + this[IDS][12]).style.display = 'none';
                s('.' + this[IDS][11]).style.display = 'none';
                fadeIn(s('.' + this[IDS][3]));

                fetch(url(), {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: method == 'GET' ? undefined : JSON.stringify({
                        passphrase: s('.' + this[IDS][0]).value,
                        hashId: s('.' + this[IDS][7]).value,
                        cyberiaAuthToken: s('.' + this[IDS][19]).value,
                        subject: s('.' + this[IDS][22]).value,
                        amount: s('.' + this[IDS][25]).value
                    }),
                })
                    .then(async (res) => {
                        console.log(url(), res);
                        return { ...await res.json(), codeStatus: res.status };
                    })
                    .then((res) => {
                        if (mode == 'copy-cli-key') {
                            console.log('POST', url(), res);
                            if (res.status == 'success') {
                                return displayCopyData(res);
                            } else {
                                return displayErrorActionKey(res);
                            }
                        }
                        if (mode == 'copy-cyberia-key') {
                            console.log('POST', url(), res);
                            if (res.status == 'success') {
                                return displayCopyData(res);
                            } else {
                                return displayErrorActionKey(res);
                            }
                        }
                        if (mode == 'link-item-cyberia') {
                            console.log('POST', url(), res);
                            if (res.status == 'success') {
                                s('.' + this[IDS][3]).style.display = 'none';
                                fadeIn(s('.' + this[IDS][4]));
                                return renderMsgInput(12, renderLang({ es: 'Ítem vinculado con éxito', en: 'Successfully Linked Item' }), true);
                            } else {
                                return displayErrorActionKey(res);
                            }
                        }
                        resetInputs();
                        if (res.status == 'error') {
                            if (mode == 'search') {
                                console.log('GET ERROR', url(), res.data);
                                return renderMsgInput(11, renderLang({ es: 'Llaves no encontradas', en: 'Keys not found' }));
                            }
                            console.log('POST ERROR', url(), res.data);
                            return renderMsgInput(11, errorMsgService);
                        }
                        htmls('.' + this[IDS][2], renderTable(res.data, table_keys.keysActions));
                        fadeIn(s('.' + this[IDS][2]));
                        if (mode == 'search') {
                            console.log('GET SUCCESS', url(), res.data);
                            return renderMsgInput(12, renderLang({ es: 'Llaves encontradas', en: 'Found keys' }), true);
                        }
                        console.log('POST SUCCESS', url(), res.data);
                        if (s('table_keys')) htmls('table_keys', table_keys.init());
                        return renderMsgInput(12, renderLang({ es: 'Las llaves han sido creadas', en: 'The keys have been created' }), true);
                    }).catch(error => {
                        console.log('KEYS SERVICE ERROR', url(), error);
                        return renderMsgInput(11, errorMsgService);
                    });

            };
            s('.' + this[IDS][13]).onclick = e => {
                e.preventDefault();
                generateIdHashInput();
            };
            s('.' + this[IDS][15]).onclick = e => {
                e.preventDefault();
                resetInputs();
                s('.' + this[IDS][2]).style.display = 'none';
                s('.' + this[IDS][15]).style.display = 'none';
                fadeIn(s('.' + this[IDS][4]));
            };
            let openKeyConfig = false;
            s('.' + this[IDS][16]).onclick = e => {
                e.preventDefault();
                if (openKeyConfig) {
                    openKeyConfig = false;
                    htmls('.' + this[IDS][16], renderLang({ es: 'Ver Configuración', en: 'See Configuration' }));
                    s('.' + this[IDS][17]).style.display = 'none';
                } else {
                    openKeyConfig = true;
                    htmls('.' + this[IDS][16], renderLang({ es: 'Ocultar Configuración', en: 'Hide Configuration' }));
                    fadeIn(s('.' + this[IDS][17]));
                }
            };
        });
        return /*html*/`
            <div class='in container'>
                <div class='in title'>
                    <i class='fa fa-key' aria-hidden='true'></i>
                    <span class='${this[IDS][14]}'>
                        ${renderLang({ es: 'Crear llaves Asimetricas', en: 'Create Asymmetric keys' })}
                    </span>
                </div>
                <form class='in ${this[IDS][4]}'>

                  <label class='in ${this[IDS][8]}' style='top: ${topLabelInput}; display: none'>${renderLang({ es: 'Hash ID', en: 'Hash ID' })}</label>
                  <input class='in ${this[IDS][7]}' type='text' style='display: none' disabled autocomplete='off'>
                  <div class='in error-input ${this[IDS][6]}'></div>

                  <label class='in ${this[IDS][18]}' style='top: ${topLabelInput}; display: none'>${renderLang({ es: 'Cyberia Auth Token', en: 'Cyberia Auth Token' })}</label>
                  <input class='in ${this[IDS][19]}' type='text' style='display: none' autocomplete='off'>
                  <div class='in error-input ${this[IDS][20]}'></div>

                
                  <label class='in ${this[IDS][21]}' style='top: ${topLabelInput}; display: none'>
                         ${renderLang({ es: 'Token de Transacción', en: 'Transaction Token' })}
                  </label>
                  <input class='in ${this[IDS][22]}' type='text' style='display: none' autocomplete='off'>
                  <div class='in error-input ${this[IDS][23]}'></div>


                  <label class='in ${this[IDS][24]}' style='top: ${topLabelInput}; display: none'>
                         ${renderLang({ es: 'Monto', en: 'Amount' })}
                  </label>
                  <input class='in ${this[IDS][25]}' type='number' style='display: none' autocomplete='off'>
                  <div class='in error-input ${this[IDS][26]}'></div>

                  <label class='in ${this[IDS][9]}' style='top: ${topLabelInput}'>${renderLang({ es: 'Contraseña', en: 'Password' })}</label>
                  <input class='in ${this[IDS][0]}' type='password' autocomplete='new-password'>
                  <div class='in error-input ${this[IDS][5]}'></div>

                  <pre class='in ${this[IDS][27]}' style='display: none'></pre>

                  <pre class='in ${this[IDS][17]}' style='display: none'>${JSON.stringify({
            type: 'rsa',
            modulusLength: 4096,
            namedCurve: 'secp256k1',
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc'
            }
        }, null, 4)}</pre>
                
                  <button type='submit' class='${this[IDS][1]}'>
                         ${renderLang({ es: 'Crear', en: 'Create' })}
                  </button>
                  <button class='${this[IDS][13]}' style='display: none'>
                         ${renderLang({ es: 'Generar Hash ID', en: 'Generate Hash ID' })}
                  </button>
                  <button type='reset' class='${this[IDS][10]}' style='display: none'>
                         ${renderLang({ es: 'Limpiar', en: 'Reset' })}
                  </button>
                  <button class='${this[IDS][16]}'>
                         ${renderLang({ es: 'Ver Configuración', en: 'See Configuration' })}
                  </button>
                  <button class='${this[IDS][28]}' style='display: none'>
                         ${renderLang({ es: 'Copiar', en: 'Copy' })}
                  </button>
                  ${options && options.buttons ? options.buttons.join('') : ''}
                </form>
                <div class='in ${this[IDS][2]}' style='display: none;'></div>
                <div class='in error-input ${this[IDS][11]}'></div>
                <div class='in success-input ${this[IDS][12]}'></div>
                <button type='reset' class='${this[IDS][15]}' style='display: none'>
                    ${renderLang({ es: 'Crear nueva llave', en: 'Create new Key' })}
                </button>               
                ${renderSpinner(this[IDS][3])}
            </div>
        `
    }
};