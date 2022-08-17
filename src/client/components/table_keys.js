

this.table_keys = {
    getKeys: () => new Promise((resolve, reject) => {
        const url = () => `${buildBaseApiUri()}/api/${uriApi}`;
        fetch(url(), {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': renderAuthBearer()
            },
        })
            .then((res) => res.json())
            .then((res) => {
                if (res.status == 'error') {
                    console.log('GET ERROR', url(), res.data);
                    return reject([]);
                }
                console.log('GET SUCCESS', url(), res.data);
                return resolve(res.data);
            }).catch(error => {
                console.log('GET ERROR', url(), error);
                return reject([]);
            });
    }),
    renderTable: async function (IDS) {
        s('.' + this[IDS][0]).style.display = 'none';
        fadeIn(s('.' + this[IDS][1]));
        const data = await this.getKeys();
        htmls('.' + this[IDS][0], renderTable(data, this.keysActions));
        s('.' + this[IDS][1]).style.display = 'none';
        fadeIn(s('.' + this[IDS][0]));
    },
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'table_keys-' + s4());
        setTimeout(() => this.renderTable(IDS));
        return /*html*/`
            <div class='in container'>
                <div class='in title'>
                    <i class='fa fa-key' aria-hidden='true'></i>
                    ${renderLang({ es: 'Lista de llaves Asimetricas', en: 'Asymmetric keys List' })}
                </div>
                ${renderSpinner(this[IDS][1])}
                <div class='in ${this[IDS][0]}' style='display: none'></div>
            </div>
        `;
    },
    keysActions: {
        actions: function (dataObj) {
            const IDS = s4();
            const openModalAction = (mode) => {
                htmls('modal', GLOBAL.form_key.init({
                    mode,
                    buttons: [
                        /*html*/`<button class='${this[IDS][2]}'>${renderLang({ es: 'Volver', en: 'Back' })}</button>`
                    ],
                    data: dataObj
                }));
                s('main').style.display = 'none';
                fadeIn(s('modal'));
                s('.' + this[IDS][2]).onclick = () => {
                    s('modal').style.display = 'none';
                    htmls('modal', '');
                    fadeIn(s('main'));
                }
            };
            this[IDS] = range(0, maxIdComponent).map(() => 'keysActions-' + s4());
            setTimeout(() => {
                s('.' + this[IDS][0]).onclick = () => {
                    console.log('copy cyberia', dataObj);
                    openModalAction('copy-cyberia-key');
                };
                s('.' + this[IDS][3]).onclick = () => {
                    console.log('link item cyberia', dataObj);
                    openModalAction('link-item-cyberia');
                };
                s('.' + this[IDS][1]).onclick = () => {
                    console.log('copy cli key', dataObj);
                    openModalAction('copy-cli-key');
                };
            });
            return /*html*/`
                    <th style='text-align: left'> 
                         <button class='${this[IDS][1]}'>${renderLang({ es: 'Copiar Llaves para CLI', en: 'Copy Keys for CLI' })}</button>
                         <button class='${this[IDS][0]}'>${renderLang({ es: 'Copiar Llave Publica para Cyberia Online', en: 'Copy Public Key for Cyberia Online' })}</button>
                         <button class='${this[IDS][3]}'>${renderLang({ es: 'Vincular Ítem de Cyberia en LLave Pública', en: 'Link Cyberia Item to Public Key' })}</button>
                    </th>
                `;
        }
    }
};
