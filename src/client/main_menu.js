this.main_menu = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'main_menu-' + s4());

        const renderMmenubtn = (path, i) => /*html*/`   
        <button class='${this[IDS][i]}'>${renderLang(path.title)}</button>          
        `;

        setTimeout(() => {

            if (viewPaths[0].menu) prepend('.' + this[IDS][viewPaths.length], renderMmenubtn(viewPaths[0], 0));

            viewPaths.map((path, i) => {

                if (s('.' + this[IDS][i])) s('.' + this[IDS][i]).onclick = () => {
                    console.log('main_menu onclick', path);
                    return GLOBAL.router({ newPath: path.path });
                }

            });

        });
        return /*html*/`
                <div class='in container ${this[IDS][viewPaths.length]}'>

                    <pre_menu_container></pre_menu_container>
                    ${viewPaths.map((path, i) => path.menu && i != 0 ?/*html*/renderMmenubtn(path, i) : '').join('')}
                    <post_menu_container></post_menu_container>
                </div>
                <div class='in container ${this[IDS][viewPaths.length + 1]}' style='display: none'>
                        <button class='${this[IDS][viewPaths.length + 2]}'>${renderLang({ es: 'Menu', en: 'Menu' })}</button> 
                </div>
        `
    }
};