

this.register = {
    init: function (options) {



        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'register-' + s4());


        let url = () => `/api/${uriAuth}/register`;
        let labelInputs = [12, 0, 3, 6];
        let valueInputs = [13, 1, 4, 7];
        let errorInputs = [14, 2, 5, 8];
        let inputsData = [
            {
                model: 'username',
                matrix: [12, 13, 14],
                displayName: renderLang({ es: 'Nombre de usuario', en: 'User Name' }),
                options: {
                    autocomplete: 'new-password'
                },
                validator: () => true,
                getValue: () => s(`.${this[IDS][13]}`).value
            },
            {
                model: 'email',
                matrix: [0, 1, 2],
                displayName: renderLang({ es: 'email', en: 'email' }),
                options: {
                    type: 'email',
                    autocomplete: 'new-password'
                },
                validator: () => true,
                getValue: () => s(`.${this[IDS][1]}`).value
            },
            {
                model: 'pass',
                matrix: [3, 4, 5],
                displayName: renderLang({ es: 'contraseña', en: 'password' }),
                options: {
                    type: 'password',
                    autocomplete: 'new-password'
                },
                validator: (inputId, labelId) => {
                    if (s('.' + this[IDS][7]) && s('.' + this[IDS][inputId]).value == s('.' + this[IDS][7]).value) {
                        s('.' + this[IDS][8]).style.display = 'none';
                    }
                    return true;
                },
                getValue: () => s(`.${this[IDS][4]}`).value
            },
            {
                model: 'repeat_pass',
                matrix: [6, 7, 8],
                displayName: renderLang({ es: 'repetir contraseña', en: 'repeat password' }),
                options: {
                    type: 'password',
                    autocomplete: 'new-password'
                },
                validator: (inputId, labelId) => {
                    if (s('.' + this[IDS][inputId]).value != s('.' + this[IDS][4]).value) {
                        htmls('.' + this[IDS][labelId], errorIcon + ' invalid match password');
                        fadeIn(s('.' + this[IDS][labelId]));
                        return false;
                    }
                    return true;
                },
                getValue: () => s(`.${this[IDS][7]}`).value
            },

        ];

        if (options) {
            switch (options.mode) {
                case 'login':
                    url = () => `/api/${uriAuth}/login`;

                    valueInputs.shift();
                    errorInputs.shift();
                    inputsData.shift();
                    labelInputs.shift();

                    valueInputs.pop();
                    errorInputs.pop();
                    inputsData.pop();
                    labelInputs.pop();

                    inputsData = inputsData.map(itemInput => {
                        itemInput.options.onlyEmpty = true;
                        return itemInput;
                    });

                    break;

                default:
                    break;
            }
        }

        setTimeout(() => {

            checkAuthStatus();
            const idCheckAuthStatus = 'check_auth_status';
            if (GLOBAL[idCheckAuthStatus]) clearInterval(GLOBAL[idCheckAuthStatus]);
            GLOBAL[idCheckAuthStatus] = setInterval(async () => checkAuthStatus(), 5000);

            s('.' + this[IDS][9]).onclick = e => {
                e.preventDefault();

                if (s('.' + this[IDS][13]))
                    s('.' + this[IDS][13]).value =
                        s('.' + this[IDS][13]).value.replaceAll(' ', '-');

                valueInputs.map(x => s('.' + this[IDS][x]).oninput());

                if (errorInputs.filter(x => s('.' + this[IDS][x]).style.display == 'block').length > 0) {
                    console.error('invalid form');
                    return;
                };

                let body = {};

                inputsData.map(inputsData =>
                    body[inputsData.model] = inputsData.getValue());

                console.log('Auth Obj body', body);

                const method = 'POST';
                const headers = {
                    'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };

                console.log('init fetch body:', body);

                (async () => {
                    s('.' + this[IDS][11]).style.display = 'none';
                    fadeIn(s('.' + this[IDS][10]));
                    const requestResult = await serviceRequest(url, {
                        method,
                        headers,
                        body: JSON.stringify(body), // : method == 'GET' ? undefined : JSON.stringify(body)
                    });
                    console.log('end fetch requestResult:', requestResult);
                    s('.' + this[IDS][10]).style.display = 'none';
                    fadeIn(s('.' + this[IDS][11]));
                    if (requestResult.status == 'success') {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: options && options.mode == 'login' ?
                                renderLang({ es: 'Ingreso exitoso', en: 'Success login' }) :
                                renderLang({ es: 'Usuario creado con exito', en: 'Success user created' })
                        }));
                        if (options && options.mode == 'login') {
                            localStorage.setItem('_b', requestResult.data.token);
                            localStorage.setItem('username', requestResult.data.user.username);
                            localStorage.setItem('email', requestResult.data.user.email);
                            localStorage.setItem('expiresIn', requestResult.data.expiresIn);
                            htmls('session-top-bar', GLOBAL.main_menu.renderSessionToBar());
                            htmls('main_menu', GLOBAL.main_menu.init());
                            s('login').style.display = 'none';
                            GLOBAL.router({ newPath: buildBaseUri() + '/my-content' });
                        }
                        valueInputs.map((inputId, i) => {
                            s('.' + this[IDS][inputId]).value = '';
                            s('.' + this[IDS][labelInputs[i]]).style.top = topLabelInput;
                        });
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
                <form class='in container ${this[IDS][11]}'>

                    ${inputsData.map(dataInput => renderInput(
            this[IDS],
            dataInput.displayName,
            dataInput.matrix,
            dataInput.validator,
            dataInput.options
        )).join('')}

        
        <button class='${this[IDS][9]}'>
            ${options && options.mode == 'login' ?
                renderLang({ es: 'Iniciar Sesión', en: 'Log In' }) :
                renderLang({ es: 'Registrarse', en: 'Sign In' })}
        </button>                        
                </form> 
                ${renderSpinner(this[IDS][10])}
        `
    }
};