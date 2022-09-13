

this.cloud = {
    init: function () {

        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'cloud-' + s4());

        this.updateDirectory();

        this.setDefaultData();
        this.idForm = 'x' + s4();
        this.idFormFiles = 'x' * s4();
        this.idContentNavi = 'x' + s4();

        this.idAddElement = 'x' + s4();
        this.backNaviForm = 'x' + s4();
        this.backNaviFormFiles = 'x' + s4();

        const onFiles = files => {
            console.log('onFiles', files);
        };

        setTimeout(() => {
            s('.' + this.idAddElement).onclick = async e => {
                e.preventDefault();

                const value = s('.' + this[IDS][1]).value.replaceAll(' ', '-');

                if (value == '') return;

                const path = this.currentPathSquence + '/' + value;

                console.log(value, this.currenIdSquence);
                this.currenIdSquence.data.push({ name: value, data: [] });

                console.log('new path', this.data, path);

                const dataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/path`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': renderAuthBearer()
                    },
                    body: JSON.stringify({
                        newNamePath: value,
                        path,
                        data: this.data
                    })
                });

                if (dataRequest.status == 'error') return append('body', renderFixModal({
                    id: 'x' + s4(),
                    icon: errorIcon,
                    color: 'red',
                    content: renderLang({ es: 'Error service', en: 'Error en el Servicio' })
                }));

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
            s('.' + this.backNaviFormFiles).onclick = e => {
                e.preventDefault();
                s('.' + this.idFormFiles).style.display = 'none';
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

        <form class='in container ${this.idFormFiles}' style='display: none'>
                ${renderFilesInput({
            onchange: onFiles
        })}
                <button class='${this.backNaviFormFiles}'>
                    <i class='fas fa-times'></i>
                </button>    
        </form>

        <navi class='${this.idContentNavi}'> 
            ${this.renderDirectory(this.data)} 
        <navi>

        `
    },
    renderDirectory: function (dataDir, path) {
        let parentDir = dataDir;
        console.warn('renderDirectory', path);
        return dataDir.map((dataDir, indexDir) => {

            const idRow = 'x' + s4();

            setTimeout(() => {
                if (s('.new-' + idRow)) s('.new-' + idRow).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idForm));
                    this.currenIdSquence = dataDir;
                    this.currentPathSquence = newInstance((path == undefined ? dataDir.name : path + '/' + dataDir.name));
                };
                if (s('.files-' + idRow)) s('.files-' + idRow).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idFormFiles));

                };
                if (s('.delete-' + idRow)) s('.delete-' + idRow).onclick = async () => {
                    const pathDelete = path + '/' + dataDir.name;
                    console.log('delete folder', pathDelete);

                    parentDir.splice(indexDir, 1);
                    console.log(this.data);

                    const dataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/path`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': renderAuthBearer()
                        },
                        body: JSON.stringify({
                            deletePath: pathDelete,
                            data: this.data
                        })
                    });

                    if (dataRequest.status == 'error') return append('body', renderFixModal({
                        id: 'x' + s4(),
                        icon: errorIcon,
                        color: 'red',
                        content: renderLang({ es: 'Error service', en: 'Error en el Servicio' })
                    }))
                    else append('body', renderFixModal({
                        id: 'x' + s4(),
                        icon: sucessIcon,
                        color: 'green',
                        content: renderLang({ es: 'Carpeta Eliminada', en: 'Deleted Forlder' })
                    }));

                    // this.data = dataRequest.data;

                    htmls('navi', this.renderDirectory(this.data));

                };
            });

            return /*html*/`
                    <row class='container title container-${idRow}'>
                        <div class='g-sa' style='width: 80%;'>
                            ${dataDir.name}
                        </div>
                        <div class='g-sa' style='width: 100px;'>
                            <i class='fas fa-plus new-${idRow}'></i>
                            <i class='fas fa-file files-${idRow}'></i>
                            ${path != undefined ?/*html*/ `<i class='fas fa-trash delete-${idRow}'></i> ` : ''}
                        </div>
                    </row>
                    <sub-folder-${idRow} class='in' style='padding-left: 20px'> 
                        ${this.renderDirectory(dataDir.data, (path == undefined ? dataDir.name : path + '/' + dataDir.name))}
                    </sub-folder-${idRow}>
                `
        }).join('');
    },
    updateDirectory: async function () {
        const getDataDirectoryUser = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/path`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': renderAuthBearer()
            },
            // body: JSON.stringify({
            //     newNamePath: value,
            //     path,
            //     data: this.data
            // })
        });
        if (getDataDirectoryUser.status != 'error')
            this.data = getDataDirectoryUser.data;
        else this.setDefaultData();
        htmls('navi', this.renderDirectory(this.data));
    },
    setDefaultData: function () {
        this.data = [
            {
                name: '/' + (localStorage.getItem('username') ? localStorage.getItem('username') : `ANON${s4()}`),
                data: []
            }
        ];
    },
    routerDisplay: function () {
        this.updateDirectory();
    }
};