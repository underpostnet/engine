import express from 'express';

const statics = app => {
    app.use('/assets', express.static(`./src/client/assets`));
    app.use('/.well-known', express.static(`./src/.well-known`));
    app.use('/fontawesome', express.static(`./node_modules/@fortawesome/fontawesome-free/css`));
    app.use('/webfonts', express.static(`./node_modules/@fortawesome/fontawesome-free/webfonts`));
    app.use('/tinymce', express.static('./node_modules/tinymce'));
    app.use('/simplemde', express.static('./node_modules/simplemde/dist'));
    app.use('/marked', express.static('./node_modules/marked'));
    app.use('/spectre-markdown.css', express.static('./node_modules/spectre-markdown.css'));
    app.use('/assets-underpost', express.static('./underpost_modules/underpost-library/assets'));

    app.get('/vanilla.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(fs.readFileSync('./src/client/core/vanilla.js', 'utf-8'));
    });

    app.get('/common-functions.js', (req, res) => {
        res.writeHead(200, {
            'Content-Type': ('application/javascript; charset=utf-8')
        });
        return res.end(commonFunctions());
    });
};

export { statics };