
this.my_content = {

    init: function () {
        return /*html*/`
            <table-my-content></table-my-content>
        `
    },
    actionRow: row => {
        const idUpdate = 'x' + s4();
        const idDelete = 'x' + s4();
        const idView = 'x' + s4();
        const idPublic = 'x' + s4();
        setTimeout(() => {
            s('.' + idUpdate).onclick = async () => {
                const requestResult = await serviceRequest(() => `/uploads${row.static}`);
                GLOBAL['current-edit-content'] = row;
                GLOBAL['current-edit-content'].raw = requestResult;
                GLOBAL.router(
                    {
                        newPath: viewPaths.find(x => x.component == row.component).path
                    }
                );
            };
            s('.' + idDelete).onclick = () => {
                console.log(row);

                const idYes = 'x' + s4();
                const idNo = 'x' + s4();
                const idMoval = 'mini-modal-' + s4();

                append('body', renderFixModal({
                    id: idMoval,
                    icon: '<i class="fas fa-question"></i>',
                    color: 'yellow',
                    content: () => {
                        return /*html*/`
                        ${renderLang({ es: 'Estas seguro <br> de eliminar?', en: 'Are you sure <br> to delete?' })}
                        <br>
                        <button class='${idYes}'>${renderLang({ es: 'Si', en: 'yes' })}</button>
                        <button class='${idNo}'>${renderLang({ es: 'No', en: 'No' })}</button>
                        `
                    },
                    time: 60000,
                    height: 170
                }));

                s('.' + idYes).onclick = async () => {

                    const url = () => '/api/uploader';
                    const method = 'DELETE';
                    const headers = {
                        'Authorization': renderAuthBearer(),
                        'Content-Type': 'application/json',
                        // 'content-type': 'application/octet-stream'
                        //  'content-length': CHUNK.length,
                    };

                    console.log('post delete', row);

                    const requestResult = await serviceRequest(url, {
                        method,
                        headers,
                        body: JSON.stringify(row) // : method == 'GET' ? undefined : JSON.stringify(body)
                    });

                    fadeOut(s('.' + idMoval));
                    setTimeout(() => s('.' + idMoval).remove());

                    if (requestResult.status == 'success') {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Contenido Eliminado', en: 'Deleted Content' })
                        }));
                        GLOBAL['my_content'].renderMyContentTable();
                    } else {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: errorIcon,
                            color: 'red',
                            content: requestResult.data
                        }));
                    }
                };
                s('.' + idNo).onclick = () => {
                    fadeOut(s('.' + idMoval));
                    setTimeout(() => s('.' + idMoval).remove());
                };

            };
            console.log(row);
            s('.' + idView).onclick = () => {
                GLOBAL['current-view-content'] = row;
                GLOBAL.router({ newPath: '/engine/view-content' });
            };
        });
        return /*html*/`
            <th>
                <i class='fas fa-eye ${idView}'></i>
                ${renderUpdateDeleteIcons(idUpdate, idDelete)}                
            </th>
            <th>
                ${renderToggleSwitch({
            id: idPublic, label: [
                renderLang({ es: `Privado`, en: `Private` }),
                renderLang({ es: `Publico`, en: `Public` })
            ],
            checked: row.public,
            onChange: async state => {
                console.log('onChange', row, state);
                if (state != row.public) {

                    row.public = state;

                    const url = () => '/api/uploader/visibility';
                    const method = 'PUT';
                    const headers = {
                        'Authorization': renderAuthBearer(),
                        'Content-Type': 'application/json'
                        // 'content-type': 'application/octet-stream'
                        //  'content-length': CHUNK.length,
                    };
                    const body = JSON.stringify(row);
                    const requestResult = await serviceRequest(url, {
                        method,
                        headers,
                        body // : method == 'GET' ? undefined : JSON.stringify(body)
                    });

                    console.log('request', requestResult);

                    if (requestResult.status == 'success') {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: sucessIcon,
                            color: 'green',
                            content: renderLang({ es: 'Visibilidad Cambiada', en: 'Changed Visibility' })
                        }));
                    } else {
                        append('body', renderFixModal({
                            id: 'mini-modal-' + s4(),
                            icon: errorIcon,
                            color: 'red',
                            content: requestResult.data
                        }));
                    }

                }
            }
        })}
            </th>
            `
    },
    renderMyContentTable: async function () {
        const requestResult = await serviceRequest(() => '/api/uploader', {
            headers: {
                'Authorization': renderAuthBearer()
            }
        });

        console.log('request', requestResult);

        if (requestResult.status == 'success') {
            if (requestResult.data[0]) {
                htmls('table-my-content',
                    /*html*/`
                  <div class='in container'> 
                    ${renderTable(requestResult.data[0].markdown, {
                    actions: this.actionRow,
                    customHeader: '<th></th><th></th>'
                })
                    + renderTable(requestResult.data[0].editor, {
                        actions: this.actionRow,
                        customHeader: '<th></th><th></th>'
                    })
                    + renderTable(requestResult.data[0]['js-demo'], {
                        actions: this.actionRow,
                        customHeader: '<th></th><th></th>'
                    })}
                    </div> `
                );
            }
            // append('body', renderFixModal({
            //     id: 'mini-modal-' + s4(),
            //     icon: sucessIcon,
            //     color: 'green',
            //     content: renderLang({ es: 'Contenido Obtenido', en: 'Obtained content' })
            // }));
        } else {
            // append('body', renderFixModal({
            //     id: 'mini-modal-' + s4(),
            //     icon: errorIcon,
            //     color: 'red',
            //     content: requestResult.data
            // }));
        }
    },
    routerDisplay: function () {
        this.renderMyContentTable();
    }

};