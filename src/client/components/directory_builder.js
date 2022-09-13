

this.directory_builder = {
    init: function () {

        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'directory_builder-' + s4());

        this.data = [
            {
                name: 'PATH:/' + (localStorage.getItem('username') ? localStorage.getItem('username') : `ANON${s4()}`),
                data: []
            }
        ];
        this.idForm = 'x' + s4();
        this.idContentNavi = 'x' + s4();

        this.idAddElement = 'x' + s4();
        this.backNaviForm = 'x' + s4();

        setTimeout(() => {
            s('.' + this.idAddElement).onclick = e => {
                e.preventDefault();

                const value = s('.' + this[IDS][1]).value;

                if (value == '') return;

                console.log(value, this.currenIdSquence);
                this.currenIdSquence.data.push({ name: value, data: [] });

                console.log(this.data, this.currentPathSquence + '/' + value);

                htmls('navi', this.renderDirectory(this.data));

                s('.' + this.idForm).style.display = 'none';
                fadeIn(s('.' + this.idContentNavi));
                clearInput(this[IDS], [0, 1, 2]);

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

        <navi class='${this.idContentNavi}'> 
            ${this.renderDirectory(this.data)} 
        <navi>

        `
    },
    renderDirectory: function (dataDir, path) {
        console.warn('renderDirectory', path);
        return dataDir.map((dataDir) => {

            const idRow = 'x' + s4();

            setTimeout(() => {
                s('.new-' + idRow).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idForm));
                    this.currenIdSquence = dataDir;
                    this.currentPathSquence = newInstance((path == undefined ? dataDir.name : path));
                };
            });

            return /*html*/`
                    <row class='container title container-${idRow}'>
                        <div class='g-sa' style='width: 80%; ${rrb()}'>
                            ${dataDir.name}
                        </div>
                        <div class='g-sa' style='width: 100px; ${rrb()}'>
                            <i class='fas fa-plus new-${idRow}'></i>
                        </div>
                    </row>
                    <sub-folder-${idRow} class='in' style='padding-left: 20px'> 
                        ${this.renderDirectory(dataDir.data, (path == undefined ? dataDir.name : path + '/' + dataDir.name))}
                    </sub-folder-${idRow}>
                `
        }).join('');
    }
};