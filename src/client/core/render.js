

const renderUpdateDeleteIcons = (idUpdate, idDelete) => /*html*/`
    <i class='fas fa-edit ${idUpdate}'></i>    
    <i class='fas fa-trash ${idDelete}'></i>
`;

const renderLangBtns = () => {
    setTimeout(() => {
        s('.exec-en').onclick = () => {
            localStorage.setItem('lang', 'en');
            // console.log(viewPaths);
            this.init_render({ newPath: getURI() });
        };
        s('.exec-es').onclick = () => {
            localStorage.setItem('lang', 'es');
            // console.log(viewPaths);
            this.init_render({ newPath: getURI() });
        };
        if (s('html').lang == 'es') {
            s('.exec-en').classList.remove('menuBtnActive');
            s('.exec-es').classList.add('menuBtnActive');
        } else {
            s('.exec-es').classList.remove('menuBtnActive');
            s('.exec-en').classList.add('menuBtnActive');
        }
    });
    return /*html*/`
    <div class='fl'>
        <button class='in flr exec-en'>EN</button>
        <button class='in flr exec-es'>ES</button>
    </div>
    `
};

const checkWindowDimension = () => {
    let w = null;
    let h = null;
    const checkMobile = () => {
        if (window.innerHeight != h || window.innerWidth != w) {
            w = newInstance(window.innerWidth);
            h = newInstance(window.innerHeight);
            viewPaths.map(pathData => {
                if (this[pathData.component] && this[pathData.component].changeWindowDimension) {
                    GLOBAL['dimensionData'] = newInstance({
                        w, h, mobile: window.innerWidth <= mobileLimit
                    });
                    this[pathData.component].changeWindowDimension(GLOBAL['dimensionData']);
                }
            });
        }
    };
    checkMobile();
    if (GLOBAL['checkMobileStatus']) clearInterval(GLOBAL['checkMobileStatus']);
    GLOBAL['checkMobileStatus'] = setInterval(() => checkMobile(), 500);
};