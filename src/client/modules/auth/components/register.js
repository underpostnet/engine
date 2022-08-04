

this.register = {
    init: function () {



        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'register-' + s4());



        let inputsData = [
            {
                model: 'email',
                matrix: [0, 1, 2],
                displayName: renderLang({ es: 'email', en: 'email' }),
                options: {
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
                validator: () => true,
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
                validator: () => true,
                getValue: () => s(`.${this[IDS][7]}`).value
            },

        ];

        setTimeout(() => {
            s('.' + this[IDS][9]).onclick = e => {
                e.preventDefault();

                let body = {};

                inputsData.map(inputsData =>
                    body[inputsData.model] = inputsData.getValue());

                console.log('Auth Obj body', body);

                const url = () => `/api/${uriAuth}`;
                const method = 'POST';
                const headers = {
                    'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };

                console.log('init fetch body:', body);

                (async () => {
                    const requestResult = await serviceRequest(url, {
                        method,
                        headers,
                        body: JSON.stringify(body), // : method == 'GET' ? undefined : JSON.stringify(body)
                    });
                    console.log('end fetch requestResult:', requestResult);
                })();

            };
        });

        // ${renderInput(this[IDS], , , ,)}

        return /*html*/`
                <form class='in container'>

                    ${inputsData.map(dataInput => renderInput(
            this[IDS],
            dataInput.displayName,
            dataInput.matrix,
            dataInput.validator,
            dataInput.options
        )).join('')}

        
        <button class='${this[IDS][9]}'>
            ${renderLang({ es: 'Iniciar Sesion', en: 'Log In' })}
        </button>                        
                </form> 
        `
    }
};