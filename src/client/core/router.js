this.router = options => {
    console.log('INIT ROUTER', options);
    let valid = false;
    let testEvalPath;
    try {
        testEvalPath = options.newPath;
    } catch (error) {
        testEvalPath = view.path;
    }
    viewPaths.map((path, i) => {
        const testIncludesHome = path.homePaths.includes(testEvalPath);
        const validPath = path.path == testEvalPath;
        // console.log('-------------------------------------');
        // console.warn('valid path', validPath);
        if (validPath) {
            valid = true;
            if (testEvalPath != getURI()) {
                setURI(testEvalPath == '' ? '/' : testEvalPath);
                htmls('title', (renderLang(path.title) == '' ? '' : renderLang(path.title) + ' - ')
                    + viewMetaData.mainTitle);
            };
            GLOBAL['currentComponent'] = path.component;
        };
        // if (validPath && (testEvalPath != view.path)) setURI(testEvalPath);
        if (validPath
            || (path.home && testIncludesHome)
            || (path.nohome && (!testIncludesHome))
        ) {
            if (path.display && validateSessionDisplayComponent(path)) {
                fadeIn(s(path.component));
                if (GLOBAL[path.component] && GLOBAL[path.component].routerDisplay) GLOBAL[path.component].routerDisplay();
            };
        } else {
            s(path.component).style.display = 'none';
        }
    });
    if (!valid) location.href = testEvalPath;
};



this.router();

// Browser and App
// navigator button controller
window.onpopstate = e =>
    this.router({ newPath: getURI() });