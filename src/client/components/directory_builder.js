

this.directory_builder = {
    init: function () {

        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'markdown-' + s4());

        this.data = [
            {
                name: s4()
            }
        ];
        this.idForm = 'x' + s4();
        this.idContentNavi = 'x' + s4();

        this.idAddElement = 'x' + s4();
        this.backNaviForm = 'x' + s4();

        setTimeout(() => {
            s('.' + this.idAddElement).onclick = e => {
                e.preventDefault();
            };
            s('.' + this.backNaviForm).onclick = e => {
                e.preventDefault();
                s('.' + this.idForm).style.display = 'none';
                fadeIn(s('.' + this.idContentNavi));
            };
        });

        return /*html*/`

        <form class='in container ${this.idForm}' style='display: none'>
                ${renderInput(this[IDS], renderLang({ es: `Nombre de Carpeta`, en: `Folder Name` }), [0, 1, 2])}        
                <button type='submit' class='${this.idAddElement}'>
                    ${renderLang({
            es: 'Crear',
            en: 'Crear'
        })}        
                    <i class='fas fa-plus'></i>
                </button>      
                <button class='${this.backNaviForm}'>
                    <i class='fas fa-times'></i>
                </button>     
        </form> 

        <navi class='${this.idContentNavi}'> ${this.renderDirectory()} <navi>

        `
    },
    renderDirectory: function () {
        return this.data.map(dataDir => {

            const idDirectory = s4();

            setTimeout(() => {
                s('.new-' + idDirectory).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idForm));
                };
            });

            return /*html*/`
                    <row class='container title ${idDirectory}'>
                        <div class='g-sa' style='width: 80%; ${rrb()}'>
                            ${dataDir.name}
                        </div>
                        <div class='g-sa' style='width: 100px; ${rrb()}'>
                            <i class='fas fa-plus new-${idDirectory}'></i>
                        </div>
                    </row>            
                `
        }).join('');
    }
};