
this.colors = {
    init: function () {

        const renderColors = colors.sort((a, b) => a.hex.localeCompare(b.hex));

        return /*html*/`       
            <style>
                .content-color {
                    padding: 10px;
                    margin: 5px;
                    color: white;
                    font-size: 20px;
                    font-weight: bold;
                    border-radius: 10px;
                    ${borderChar(2, 'black')}
                }
            </style> 
            <div class='in container'>
                    ${renderColors.map(dataColor => {
            const idCopyHex = 'x' + s4() + s4();
            const idCopyName = 'x' + s4() + s4();
            setTimeout(() => {
                s(`.${idCopyHex}`).onclick = async () => {
                    await copyData(dataColor.hex);
                    append('body', renderFixModal({
                        id: 'mini-modal-' + s4(),
                        icon: sucessIcon,
                        color: 'green',
                        content: renderLang({ es: 'Contenido Copiado al Portapapeles', en: 'Copy to Clipboard' })
                    }));
                };
                s(`.${idCopyName}`).onclick = async () => {
                    await copyData(dataColor.name.toLowerCase());
                    append('body', renderFixModal({
                        id: 'mini-modal-' + s4(),
                        icon: sucessIcon,
                        color: 'green',
                        content: renderLang({ es: 'Contenido Copiado al Portapapeles', en: 'Copy to Clipboard' })
                    }));
                };
            });
            return    /*html*/`
                        <div class='inl content-color' style='background: ${dataColor.hex};'>
                            ${dataColor.name.toLowerCase()} <i class='fas fa-copy ${idCopyName}'></i>
                            <br>
                            ${dataColor.hex} <i class='fas fa-copy ${idCopyHex}'></i>
                        </div>
                    `
        }).join('')}
            </div>
        `
    }
};