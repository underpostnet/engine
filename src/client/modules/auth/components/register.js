

this.register = {
    init: function () {



        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'register-' + s4());


        setTimeout(() => {
            s('.' + this[IDS][9]).onclick = e => {
                e.preventDefault();
                alert();
            };
        });

        return /*html*/`
                <form class='in container'>

                    ${renderInput(this[IDS], renderLang({ es: 'email', en: 'email' }), [0, 1, 2], () => true.valueOf,
            {
                autocomplete: 'new-password'
            }
        )}

                    ${renderInput(this[IDS], renderLang({ es: 'contraseña', en: 'password' }), [3, 4, 5], () => true,
            {
                type: 'password',
                autocomplete: 'new-password'
            }
        )}

                    ${renderInput(this[IDS], renderLang({ es: 'repetir contraseña', en: 'repeat password' }), [6, 7, 8], () => true,
            {
                type: 'password',
                autocomplete: 'new-password'
            }
        )}
        <button class='${this[IDS][9]}'>
            ${renderLang({ es: 'Iniciar Sesion', en: 'Log In' })}
        </button>                        
                </form> 
        `
    }
};