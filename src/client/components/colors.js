
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
                    ${borderChar(2, 'black')}
                }
            </style> 
            <div class='in container'>
                    ${renderColors.map(dataColor => /*html*/`
                        <div class='inl content-color' style='background: ${dataColor.hex};'>
                            ${dataColor.name.toLowerCase()}
                        </div>
                    `).join('')}
            </div>
        `
    }
};