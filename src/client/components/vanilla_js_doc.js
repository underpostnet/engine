

this.vanilla_js_doc = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'form_key-' + s4());
        setTimeout(async () => {
            htmls('.' + this[IDS][0], Prism.highlight(await serviceRequest(() => '/vanilla.js'), Prism.languages.javascript, 'javascript'));
        });
        return /*html*/`
        <pre  class='in container'><code class='${this[IDS][0]}'></pre></code>
        `
    }
};