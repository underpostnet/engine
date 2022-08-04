

this.register = {
    init: function () {



        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'register-' + s4());




        return /*html*/`
        
        
        
        
                <div class='in container'>

                            ${renderInput(this[IDS], renderLang({ es: 'email', en: 'email' }), [0, 1, 2], () => true,
            {
                type: 'password'
            })}
                
                </div>
        
        
        
        `
    }
};