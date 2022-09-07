this.main_menu = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'main_menu-' + s4());
        const heightTopBarMenu = 60;

        this.idMenuBars = 'x' + s4();
        const idMenuClose = 'x' + s4();
        const idA = 'x' + s4();
        const idB = 'x' + s4();
        this.idC = 'x' + s4();
        const idE = 'x' + s4();
        const idD = 'x' + s4();
        const idF = 'x' + s4();

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
                        <button class='${idD}'>
                            ${renderLang({ es: 'Cerrar Sessión', en: 'Log Out' })}
                        </button>
                    `);
                    s('.' + idD).onclick = () =>
                        closeSessionComponents();
                });
                return false;
            }
            return true;
        };

        const renderMmenubtn = (path, i) => /*html*/`   
        <button class='${this[IDS][i]} btn-${path.component} btn-main-menu'  >
            ${renderLang(path.title) != '' ? renderLang(path.title) : `<i class='fas fa-home'></i>`}
        </button>          
        `;

        setTimeout(() => {

            htmls('top-main_menu', this.renderSessionToBar());
            htmls('bot-main_menu', botDescription());

            prepend('body', /*html*/`
                <div class='in ${idB}'></div>            
            `);

            if (viewPaths[0].menu) prepend('home_menu_container', renderMmenubtn(viewPaths[0], 0));

            viewPaths.map((path, i) => {
                // warn: verify this[IDS][i]
                if (s('.' + this[IDS][i]) && path.menu === true) s('.' + this[IDS][i]).onclick = () => {
                    console.log('main_menu onclick', path, '.' + this[IDS][i]);
                    if (GLOBAL['dimensionData'].mobile)
                        s('.' + this.idC).click();
                    return GLOBAL.router({ newPath: path.path });
                }

            });

            s('.' + this.idC).onclick = () => {
                if (s('.' + this.idMenuBars).style.display != 'none') {
                    s('.' + this.idMenuBars).style.display = 'none';
                    fadeIn(s('.' + idMenuClose));
                    fadeIn(s('.' + idE));
                    return;
                }
                s('.' + idMenuClose).style.display = 'none';
                fadeIn(s('.' + this.idMenuBars));
                fadeOut(s('.' + idE));
            };


        });
        return /*html*/`

        ${renderMediaQuery([
            {
                limit: 0,
                css: /*css*/`
                 .${idA} {
                    display: block;
                    position: fixed;
                    top: 0px;
                    left: 0px;
                    width: 100%;
                 }
                 .${idB} {
                    display: ${viewPaths[0].menu === true ? 'block' : 'none'};
                 }
                 .${idE} {
                    display: none;
                 }
                 .${idF} {
                    display: block;
                 }
                 .btn-main-menu {
                    display: block;
                    width: 100%;
                    text-align: center;
                  }
             `},
            {
                limit: mobileLimit,
                css: /*css*/`
                 .${idA} {
                    display: block;
                    position: relative;
                    top: auto;
                    left: auto;
                    width: auto;
                 }
                 .${idB} {
                    display: none;
                 }
                 .${idE} {
                    display: block;
                 }
                 .${idF} {
                    display: none;
                 }
                 .btn-main-menu { 
                    display: inline-table;
                    width: auto;
                    text-align: center;
                 }
             `}
        ])}

        <style>
            .${idA} {
                z-index: 2;
            }
            .${idB} {
                height: ${heightTopBarMenu}px;
            }
            .${idE} {
                 background: ${mainBackground};
            }
            .${idF} {
                background: ${mainBackground};
            }
        </style>
                <div class='${idA}'>

                    <div class='in container ${idF}'>
                        <button class='${this.idC}'>
                            <!-- ${renderLang({ es: 'Menu', en: 'Menu' })} -->
                            <i class='fa fa-bars ${this.idMenuBars}' style='display: block;'></i>
                            <i class='fa fa-times ${idMenuClose}' style='display: none;'></i>
                        </button>
                    </div>

                    <div class='in container ${idE}'>
                        <home_menu_container></home_menu_container>
                        <pre_menu_container></pre_menu_container>
                        ${viewPaths.map((path, i) => path.menu && i != 0 && validatorMenuBtn(path) ?/*html*/renderMmenubtn(path, i) : '').join('')}
                        <post_menu_container></post_menu_container>
                    </div>
                </div>
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
    },
    changeWindowDimension: function (dimensionData) {

        console.log('main_menu changeWindowDimension', dimensionData);
        if (!dimensionData.mobile && s('.' + this.idMenuBars).style.display != 'none')
            s('.' + this.idC).click();
        if (dimensionData.mobile && s('.' + this.idMenuBars).style.display == 'none')
            s('.' + this.idC).click();


    }
};