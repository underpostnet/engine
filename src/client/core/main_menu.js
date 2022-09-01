this.main_menu = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'main_menu-' + s4());
        const heightTopBarMenu = 60;

        const idMenuBars = 'x' + s4();
        const idMenuClose = 'x' + s4();

        const validatorMenuBtn = path => {
            if (!validateSessionDisplayComponent(path)) {
                return false;
            }
            if ((path.component == 'register' || path.component == 'login') && validateSession()) {
                if (path.component == 'login') {
                    return false;
                }
                setTimeout(() => {
                    append('post_menu_container', /*html*/`
                        <button class='${this[IDS][viewPaths.length + 3]}'>
                            ${renderLang({ es: 'Cerrar Sessión', en: 'Log Out' })}
                        </button>
                    `);
                    s('.' + this[IDS][viewPaths.length + 3]).onclick = () =>
                        closeSessionComponents();
                });
                return false;
            }
            return true;
        };

        const renderMmenubtn = (path, i) => /*html*/`   
        <button class='${this[IDS][i]} btn-${path.component}'  >
            ${renderLang(path.title) != '' ? renderLang(path.title) : `<i class='fas fa-home'></i>`}
        </button>          
        `;

        setTimeout(() => {

            prepend('body', /*html*/`
                <div class='in ${this[IDS][viewPaths.length + 1]}'></div>            
            `);

            if (viewPaths[0].menu) prepend('home_menu_container', renderMmenubtn(viewPaths[0], 0));

            viewPaths.map((path, i) => {
                // warn: verify this[IDS][i]
                if (s('.' + this[IDS][i]) && path.menu === true) s('.' + this[IDS][i]).onclick = () => {
                    console.log('main_menu onclick', path, '.' + this[IDS][i]);
                    return GLOBAL.router({ newPath: path.path });
                }

            });

            s('.' + this[IDS][viewPaths.length + 2]).onclick = () => {
                if (s('.' + idMenuBars).style.display != 'none') {
                    s('.' + idMenuBars).style.display = 'none';
                    fadeIn(s('.' + idMenuClose));
                    return;
                }
                s('.' + idMenuClose).style.display = 'none';
                fadeIn(s('.' + idMenuBars));
            };


        });
        return /*html*/`

        ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                 .${this[IDS][viewPaths.length]} {
                    display: block;
                    position: fixed;
                    top: 0px;
                    left: 0px;
                    width: 100%;
                 }
                 .${this[IDS][viewPaths.length + 1]} {
                    display: ${viewPaths[0].menu === true ? 'block' : 'none'};
                 }
                 .${this[IDS][viewPaths.length + 4]} {
                    display: none;
                 }
                 .${this[IDS][viewPaths.length + 5]} {
                    display: block;
                 }
             `},
            {
                limit: 600,
                css: /*css*/`
                 .${this[IDS][viewPaths.length]} {
                    display: block;
                    position: relative;
                    top: auto;
                    left: auto;
                    width: auto;
                 }
                 .${this[IDS][viewPaths.length + 1]} {
                    display: none;
                 }
                 .${this[IDS][viewPaths.length + 4]} {
                    display: block;
                 }
                 .${this[IDS][viewPaths.length + 5]} {
                    display: none;
                 }
             `}
        ])}

        <style>
            .${this[IDS][viewPaths.length]} {
                z-index: 1;
            }
            .${this[IDS][viewPaths.length + 1]} {
                height: ${heightTopBarMenu}px;
            }
            .${this[IDS][viewPaths.length + 5]} {
                background: ${mainColor};
            }
        </style>

                <session-top-bar>
                    ${this.renderSessionToBar()}
                </session-top-bar> 
                <div class='${this[IDS][viewPaths.length]}'>

                    <div class='in container ${this[IDS][viewPaths.length + 5]}'>
                        <button class='${this[IDS][viewPaths.length + 2]}'>
                            <!-- ${renderLang({ es: 'Menu', en: 'Menu' })} -->
                            <i class='fa fa-bars ${idMenuBars}'></i>
                            <i class='fa fa-times ${idMenuClose}' style='display: none;'></i>
                        </button>
                    </div>

                    <div class='in container ${this[IDS][viewPaths.length + 4]}'>
                        <home_menu_container></home_menu_container>
                        <pre_menu_container></pre_menu_container>
                        ${viewPaths.map((path, i) => path.menu && i != 0 && validatorMenuBtn(path) ?/*html*/renderMmenubtn(path, i) : '').join('')}
                        <post_menu_container></post_menu_container>
                    </div>
                </div>
                ${botDescription()}
        `
    },
    renderSessionToBar: () => {
        if (!validateSession()) return '';
        return /*html*/`
        <div class='in container'>
            ${renderLang({ es: 'Hola, ', en: 'Hi, ' })} 
            ${renderUserLink(localStorage.getItem('username'))}
        </div>  
        `
    },
    routerDisplay: () => {
        setTimeout(() => {
            viewPaths.map(dataView => {
                if (s(`.btn-${dataView.component}`)) {
                    if (GLOBAL['currentComponent'] == dataView.component) {
                        s(`.btn-${dataView.component}`).classList.add('menuBtnActive');
                    } else {
                        s(`.btn-${dataView.component}`).classList.remove('menuBtnActive');
                    }
                }
            });
        });
    }
};