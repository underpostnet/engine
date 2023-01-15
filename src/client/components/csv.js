

this.test = {

    init: function () {


        // ----------------------------------------------------------------
        // ----------------------------------------------------------------


        setTimeout(async () => {

            let csvParams = await serviceRequest(() => 'http://localhost:5500/uploads/cloud/francisco-verdugo/ffc35-cambiar.csv');
            let csvData = await serviceRequest(() => 'http://localhost:5500/uploads/cloud/francisco-verdugo/f6495-calculo met ppaq.csv');


            csvParams = csvParams.split('\r\n');
            csvParams = csvParams.map(row => {
                return row.split(';');
            });

            csvData = csvData.split('\r\n');
            csvData = csvData.map(row => {
                return row.split(';');
            });

            csvData = csvData.map((row, irow) => {
                return row.map((cell, i) => {
                    if (irow === 0) return cell;
                    csvParams.map(param => {
                        if (param[0] == cell)
                            cell = param[1];
                    });
                    return parseFloat(cell); //  * parseFloat(csvData[0][i])
                });
            });



            append('.display-data', logDataManage(csvParams, true));

            append('.display-data', `<br>---<br>`);

            append('.display-data', logDataManage(csvData, true));

            s('.copy-data').onclick = async () => {
                await copyData(csvData.map(row => {
                    return row.join(';');
                }).join('\r\n'));

                append('body', renderFixModal({
                    id: 'mini-modal-' + s4(),
                    icon: sucessIcon,
                    color: 'green',
                    content: renderLang({ es: 'Contenido Copiado al Portapapeles', en: 'Copy to Clipboard' })
                }));
            };

        });


        return /*html*/`

            <div class='in container display-data'>
                <button class='copy-data'>copiar data</button>
            </div>
        
        `
    }

};