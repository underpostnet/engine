this.markdown = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'markdown-' + s4());

        // let labelInputs = [1];
        // let inputValueContent = [2];
        // let errorsIdInput = [3];

        setTimeout(() => {
            marked.setOptions();

            this.instance = new SimpleMDE({ element: s('.markdown-editor') });

            s('.' + this[IDS][0]).onclick = () => {
                append(this[IDS][1], /*html*/`
                    <div class='in container'>
                        <div class='in markdown-css' style='background: #d9d9d9'>
                            ${marked.parse(this.instance.value())}
                        </div> 
                    </div>               
                `);
            };
        });
        return /*html*/`
        <${this[IDS][1]}></${this[IDS][1]}>
        <div class='in container' style='background: white'>
            <textarea class='markdown-editor'></textarea>
        </div>
        <div class='in container'>
            <button class='${this[IDS][0]}'>${renderLang({ es: 'Enviar', en: 'Send' })}</button>
        </div>
        `
    }
};