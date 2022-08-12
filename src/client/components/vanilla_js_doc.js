

this.vanilla_js_doc = {
    init: function (options) {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'form_key-' + s4());
        if (options && options.mode == 'css') {
            setTimeout(async () => {
                const baseA = await serviceRequest(() => '/assets/styles/base.css');
                const baseB = await serviceRequest(() => '/assets/styles/global.css');
                const baseC = await serviceRequest(() => '/assets/styles/spinner-ellipsis.css');

                const titleCss = title => /*html*/`<div class='in container title' style='margin: 10px'>${title}</div>`;

                htmls('.' + this[IDS][0],
                    (titleCss('base.css') + Prism.highlight(baseA, Prism.languages.css, 'css') +
                        titleCss('global.css') + Prism.highlight(baseB, Prism.languages.css, 'css') +
                        titleCss('spinner-ellipsis.css') + Prism.highlight(baseC, Prism.languages.css, 'css')));
            });
            return /*html*/`
            <pre  class='in container'><code class='${this[IDS][0]}'></code></pre>
            `
        }
        setTimeout(async () => {
            htmls('.' + this[IDS][0], Prism.highlight(
                await serviceRequest(() => '/vanilla.js') +
                await serviceRequest(() => '/common-functions.js'),
                Prism.languages.javascript, 'javascript'
            ));
        });
        return /*html*/`
        <pre  class='in container'><code class='${this[IDS][0]}'></code></pre>
        `
    }
};