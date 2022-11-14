

this.cloud = {
    init: function () {

        const IDS = s4();
        this.IDS = IDS;
        this[IDS] = range(0, maxIdComponent).map(() => 'cloud-' + s4());

        this.updateDirectory();

        this.setDefaultData();
        this.idForm = 'x' + s4();
        this.idFormFiles = 'x' + s4();
        this.idContentNavi = 'x' + s4();

        this.idAddElement = 'x' + s4();
        this.backNaviForm = 'x' + s4();
        this.backNaviFormFiles = 'x' + s4();

        this.sendFilesBtn = 'x' + s4();
        this.previewFiles = 'x' + s4();

        this.contentFormFilesInput = 'x' + s4();
        this.contentSpinnerFileInput = 'x' + s4();

        // files clear
        this.clearInputSelector = 'x' + s4();

        const onClearFiles = () => {
            htmls(this.previewFiles, '');
        };

        const onFiles = files => {

            this.files = files;


            const dataFiles = [];

            Object.keys(this.files).forEach((fileAttr, currentIndex) => {
                dataFiles.push({
                    name: this.files[fileAttr].name
                });
            });

            console.log('onFiles', files, dataFiles);

            htmls(this.previewFiles, renderTable(dataFiles));

        };

        setTimeout(() => {
            s('.' + this.idAddElement).onclick = async e => {
                e.preventDefault();

                const value = s('.' + this[IDS][1]).value.replaceAll(' ', '-');

                if (value == '') return;

                const path = this.currentPathSquence + '/' + value;

                if (this.currenIdSquence.data.find(x => x.name == value))
                    return append('body', renderFixModal({
                        id: 'x' + s4(),
                        icon: errorIcon,
                        color: 'red',
                        content: renderLang({ en: 'Folder name already Exists', es: 'El nombre de la Carpeta ya existe' })
                    }));

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
            s('.' + this.sendFilesBtn).onclick = async e => {
                e.preventDefault();

                s(this.contentFormFilesInput).style.display = 'none';
                fadeIn(s(this.contentSpinnerFileInput));

                let body = new FormData();

                Object.keys(this.files).forEach((fileAttr, currentIndex) => {

                    const currentFile = this.files[fileAttr];
                    const fileObj = {
                        name: currentFile.name,
                        static: 'f' + s4() + '-' + currentFile.name
                    };
                    this.currenIdSquence.files ?
                        this.currenIdSquence.files.push(fileObj) :
                        this.currenIdSquence.files = [fileObj];
                    body.append(fileObj.static, this.files[fileAttr]);
                });

                console.log('this.files', this.files);
                console.log('this.data', this.data);
                console.log('this.currentPathSquence', this.currentPathSquence);
                console.log('body', body);


                const url = () => `${buildBaseApiUri()}/api/${apiUploader}/files`;
                const method = 'POST';
                const headers = {
                    'Authorization': renderAuthBearer()
                    // 'Content-Type': 'application/json',
                    // 'content-type': 'application/octet-stream'
                    //  'content-length': CHUNK.length,
                };
                body.append('path', this.currentPathSquence);
                body.append('data', JSON.stringify(this.data));

                const requestResult = await serviceRequest(url, {
                    method,
                    headers,
                    body, // : method == 'GET' ? undefined : JSON.stringify(body)
                });

                s(this.contentSpinnerFileInput).style.display = 'none';
                s(this.contentFormFilesInput).style.display = 'block';

                if (requestResult.status == 'error') {
                    append('body', renderFixModal({
                        id: 'x' + s4(),
                        icon: errorIcon,
                        color: 'red',
                        content: renderLang({ es: 'Error service', en: 'Error en el Servicio' })
                    }));
                } else {
                    append('body', renderFixModal({
                        id: 'x' + s4(),
                        icon: sucessIcon,
                        color: 'green',
                        content: renderLang({ es: 'Archivos subidos con éxito', en: 'Files uploaded successfully' })
                    }))
                };

                s('.' + this.backNaviFormFiles).click();
                s('.' + this.clearInputSelector).click();
                this.updateDirectory();


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
        <${this.previewFiles}></${this.previewFiles}>
       
        <${this.contentFormFilesInput} class='in'>
            ${renderFilesInput({
            onchange: onFiles,
            clear: onClearFiles,
            clearInputSelector: this.clearInputSelector
        })}
        </${this.contentFormFilesInput}>

        <${this.contentSpinnerFileInput}  class='in' style='display: none'>
            <div class='in container title' style='text-align: center'>
                <br>
                ${renderLang({ en: 'Uploading file', es: 'Subiendo Archivo' })}
                <br>
                <br>
            </div>
            ${renderSpinner(`x${s4()}`, { style: 'display: block; text-align: center' })}
        </${this.contentSpinnerFileInput}>
               
                <button class='${this.sendFilesBtn}'>
                    ${renderLang({ es: 'Subir Archivos', en: 'Send Files' })}
                </button> 
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
            const setCurrentDataPathFiles = () => {
                this.currenIdSquence = dataDir;
                this.currentPathSquence = newInstance((path == undefined ? dataDir.name : path + '/' + dataDir.name));
            };

            setTimeout(() => {
                if (s('.new-' + idRow)) s('.new-' + idRow).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idForm));
                    setCurrentDataPathFiles();
                };
                if (s('.files-' + idRow)) s('.files-' + idRow).onclick = () => {
                    s('.' + this.idContentNavi).style.display = 'none';
                    fadeIn(s('.' + this.idFormFiles));
                    setCurrentDataPathFiles();

                };
                if (s('.delete-' + idRow)) s('.delete-' + idRow).onclick = () => {

                    const idYes = 'x' + s4();
                    const idNo = 'x' + s4();
                    const idMoval = 'mini-modal-' + s4();

                    append('body', renderFixModal({
                        id: idMoval,
                        icon: '<i class="fas fa-question"></i>',
                        color: 'yellow',
                        content: () => {
                            return /*html*/`
                        ${renderLang({ es: 'Estas seguro <br> de eliminar <br> ' + path + '/' + dataDir.name + '?', en: 'Are you sure <br> to delete <br> ' + path + '/' + dataDir.name + '?' })}
                        <br>
                        <button class='${idYes}'>${renderLang({ es: 'Si', en: 'yes' })}</button>
                        <button class='${idNo}'>${renderLang({ es: 'No', en: 'No' })}</button>
                        `
                        },
                        time: 60000,
                        height: 200
                    }));

                    s('.' + idYes).onclick = async () => {
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

                        fadeOut(s('.' + idMoval));
                        setTimeout(() => s('.' + idMoval).remove());

                    };

                    s('.' + idNo).onclick = () => {
                        fadeOut(s('.' + idMoval));
                        setTimeout(() => s('.' + idMoval).remove());
                    };

                };
            });

            return /*html*/`
                    <row class='container title container-${idRow}'>
                        <div class='g-sa' style='width: 80%;'>
                            <i class='fas fa-folder'></i> ${dataDir.name}
                        </div>
                        <div class='g-sa' style='width: 100px;'>
                            <i class='fas fa-plus new-${idRow}'></i>
                            <i class='fas fa-file files-${idRow}'></i>
                            ${path != undefined ?/*html*/ `<i class='fas fa-trash delete-${idRow}'></i> ` : ''}
                        </div>
                    </row>
                    ${dataDir.files ?/*html*/`
                    <div class='in container'>
                        <files-${idRow} class='in' style='padding-left: 20px'> 
                            ${renderTable(dataDir.files.map(x => {
                x.path = newInstance((path == undefined ? dataDir.name : path + '/' + dataDir.name));
                x.dataDir = () => dataDir;
                return x;
            }), {
                actions: this.actionRowFile,
                customHeader: '<th></th>'
            })}
                        </files-${idRow}>
                    </div>
                    ` : ''}
                    <sub-folder-${idRow} class='in' style='padding-left: 20px'> 
                        ${this.renderDirectory(dataDir.data, (path == undefined ? dataDir.name : path + '/' + dataDir.name))}
                    </sub-folder-${idRow}>
                `
        }).join('');
    },
    updateDirectory: async function () {
        if (!GLOBAL['auth']) return this.setDefaultData();
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
    },
    actionRowFile: function (row) {

        const idView = 'x' + s4();
        const idDelete = 'x' + s4();
        const idYt = 'x' + s4();

        setTimeout(() => {
            if (s('.' + idYt)) s('.' + idYt).onclick = () => {
                const searchValue =
                    row.name.split('.')[0].split('_')[0].replaceAll('-', ' ').replaceAll('_', ' ');
                console.log('searchValue', searchValue);
                GLOBAL['yt-search'] = searchValue;
                GLOBAL.router({ newPath: `${buildBaseUri()}/yt_player` });
            };
            if (s('.' + idView)) s('.' + idView).onclick = () => {
                console.log('idView', row);
                const pathDownload = buildBaseApiUri() + '/uploads/cloud' + row.path + '/' + row.static;
                console.warn(pathDownload);
                const idDownload = 'x' + s4();
                append('body', `<a class='` + idDownload + `' style='display: none'></a>`);
                // blob case .href = window.URL.createObjectURL(blob);
                s('.' + idDownload).href = pathDownload;
                s('.' + idDownload).download = row.name;
                s('.' + idDownload).click();
                s('.' + idDownload).remove();
            };
            if (s('.' + idDelete)) s('.' + idDelete).onclick = async () => {

                const idYes = 'x' + s4();
                const idNo = 'x' + s4();
                const idMoval = 'mini-modal-' + s4();

                append('body', renderFixModal({
                    id: idMoval,
                    icon: '<i class="fas fa-question"></i>',
                    color: 'yellow',
                    content: () => {
                        return /*html*/`
                    ${renderLang({
                            es: 'Estas seguro <br> de eliminar <br> ' + row.name + '?',
                            en: 'Are you sure <br> to delete <br> ' + row.name + '?'
                        })}
                    <br>
                    <button class='${idYes}'>${renderLang({ es: 'Si', en: 'yes' })}</button>
                    <button class='${idNo}'>${renderLang({ es: 'No', en: 'No' })}</button>
                    `
                    },
                    time: 60000,
                    height: 200
                }));

                s('.' + idYes).onclick = async () => {

                    row.dataDir().files.splice(row.dataDir().files.findIndex(x => x.static == row.static), 1);

                    console.log('idDelete', row, GLOBAL.cloud.data);

                    const dataRequest = await serviceRequest(() => `${buildBaseApiUri()}/api/${apiUploader}/files`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': renderAuthBearer()
                        },
                        body: JSON.stringify({
                            deletePath: row.path + '/' + row.static,
                            data: GLOBAL.cloud.data
                        })
                    });

                    if (dataRequest.status == 'error') {
                        append('body', renderFixModal({
                            id: 'x' + s4(),
                            icon: errorIcon,
                            color: 'red',
                            content: renderLang({ es: 'Error service', en: 'Error en el Servicio' })
                        }));
                    } else {
                        append('body', renderFixModal({
                            id: 'x' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Archivo eliminado con éxito', en: 'Files delete successfully' })
                        }))
                    };

                    GLOBAL.cloud.updateDirectory();

                    fadeOut(s('.' + idMoval));
                    setTimeout(() => s('.' + idMoval).remove());

                };

                s('.' + idNo).onclick = () => {
                    fadeOut(s('.' + idMoval));
                    setTimeout(() => s('.' + idMoval).remove());
                };

            };

        });
        return /*html*/`
        <th>
            <i class='fas fa-download ${idView}'></i>
            <i class='fas fa-trash ${idDelete}'></i>      
            ${row.static.split('.').pop() == 'mp3' ?/*html*/`
            <i class='fa-brands fa-youtube ${idYt}'></i>
            `: ''}      
        </th>
        `


    }
};