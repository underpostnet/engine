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
        this.idScrollDesktopFix = 'x' + s4();
        this.buttonMenuStyleContent = 'x' + s4();

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
                        <button class='${idD} btn-main-menu'>
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
        <style class='${this.buttonMenuStyleContent}'></style>
        <${this.idScrollDesktopFix} style='max-width: 1224px'>
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
        </${this.idScrollDesktopFix}>
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


    },
    onScroll: function (dataScroll) {

        // console.log('main_menu onScroll', dataScroll, GLOBAL['dimensionData']);

        if (GLOBAL['dimensionData'].mobile === false && dataScroll.scroll >= 315) {
            if (s(this.idScrollDesktopFix).style.position == 'fixed') return;

            s(this.idScrollDesktopFix).style.position = 'fixed';
            s(this.idScrollDesktopFix).style.display = 'block';
            s(this.idScrollDesktopFix).style.zIndex = '2';
            s(this.idScrollDesktopFix).style.background = 'black';
            s(this.idScrollDesktopFix).style.transform = 'translate(-50%, 0)';
            s(this.idScrollDesktopFix).style.top = '0px';
            s(this.idScrollDesktopFix).style.left = '50%';
            s(this.idScrollDesktopFix).style.width = '100%';
            fadeIn(s(this.idScrollDesktopFix));

            htmls('.' + this.buttonMenuStyleContent, /*css*/`
                .btn-main-menu {
                    font-size: 12px !important;
                }
            `);

        } else if (dataScroll.scroll + 100 < 315) {

            s(this.idScrollDesktopFix).style.position = null;
            s(this.idScrollDesktopFix).style.display = null;
            s(this.idScrollDesktopFix).style.zIndex = null;
            s(this.idScrollDesktopFix).style.background = null;
            s(this.idScrollDesktopFix).style.transform = null;
            s(this.idScrollDesktopFix).style.top = null;
            s(this.idScrollDesktopFix).style.left = null;
            s(this.idScrollDesktopFix).style.width = null;
            s(this.idScrollDesktopFix).style.opacity = null;

            htmls('.' + this.buttonMenuStyleContent, '');
        }
    }
};