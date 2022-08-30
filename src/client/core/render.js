

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