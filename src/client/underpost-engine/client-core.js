
const maxIdComponent = 50;
const errorIcon = /*html*/`<i class='fa fa-exclamation-triangle' aria-hidden='true'></i>`;
const sucessIcon = /*html*/`<i class='fa fa-check-circle' aria-hidden='true'></i>`;
const uriApi = 'editor';

this.underpost_engine = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'underpost_engine-' + s4());
        setTimeout(() => {

        });
        return /*html*/`
           <style>
            edit-box {
                outline: none !important;
                min-height: 200px;
            }
           </style>
           <div class='in container'>
                <div class='in container'>                
                    <button>bold</button>
                </div>
                <div class='in container'>
                        <edit-box class='in' contenteditable='true'></edit-box>
                </div>                    
           </div>
             
        `
    }
};

this.main_menu = {
    init: function () {
        const IDS = s4();
        this[IDS] = range(0, maxIdComponent).map(() => 'main_menu-' + s4());
        setTimeout(() => {
            viewPaths.map((path, i) => {

                if (s('.' + this[IDS][i])) s('.' + this[IDS][i]).onclick = () => {
                    console.log('main_menu onclick', path);
                    return GLOBAL.router({ newPath: path.path });
                }

            });

        });
        return /*html*/`
                <div class='in container ${this[IDS][viewPaths.length]}'>
                ${viewPaths.map((path, i) => path.menu ?/*html*/`   

                <button class='${this[IDS][i]}'>${renderLang(path.title)}</button>    
                 
                 `: '').join('')}
                </div>
                <div class='in container ${this[IDS][viewPaths.length + 1]}' style='display: none'>
                        <button class='${this[IDS][viewPaths.length + 2]}'>${renderLang({ es: 'Menu', en: 'Menu' })}</button> 
                </div>
        `
    }
};

this.router = options => {
    console.log('INIT ROUTER', options);
    let valid = false;
    const testEvalPath = options && options.newPath ? options.newPath : view.path;
    viewPaths.map((path, i) => {
        const testIncludesHome = path.homePaths.includes(testEvalPath);
        const validPath = path.path == testEvalPath;
        // console.log('-------------------------------------');
        // console.log('router options', options);
        // console.log('testEvalPath', testEvalPath);
        // console.log('testIncludesHome', testIncludesHome);
        if (validPath) {
            valid = true;
            if (testEvalPath != getURI()) {
                setURI(testEvalPath);
                htmls('title', (renderLang(path.title) == '' ? '' : renderLang(path.title) + ' - ')
                    + viewMetaData.mainTitle);
            };
        };
        // if (validPath && (testEvalPath != view.path)) setURI(testEvalPath);
        if (validPath
            || (path.home && testIncludesHome)
            || (path.nohome && (!testIncludesHome))
        ) {
            if (path.display) fadeIn(s(path.component));
        } else {
            s(path.component).style.display = 'none';
        }
    });
    if (!valid) location.href = testEvalPath;
};

//  Asymmetric Key Manager
append('body', /*html*/`
        <div class='in container banner' style='${borderChar(1, 'white')}'>
               ${viewMetaData.mainTitle}
        </div>
        <modal></modal>
        <main>
        ${viewPaths.map(path =>/*html*/`
        <${path.component}>${this[path.options ? path.options.origin : path.component].init(path.options)}</${path.component}>
        `).join('')}
        </main>
        <footer>
            <div class='in container' style='text-align: right'>
                Source Code
                <img src='/assets/github.png' class='inl' style='width: 20px; top: 5px'> 
                <a href='https://github.com/underpostnet/underpost-engine'>GitHub</a>
                <br>
                Developed By
                <img src='/assets/underpost.png' class='inl' style='width: 23px; top: 5px; left: 3px'> 
                <a href='https://underpost.net/'>UNDERpost.net</a>
            </div> 
        </footer>
       
        

`);

this.router();

// Browser and App
// navigator button controller
window.onpopstate = e =>
    this.router({ newPath: getURI() });
