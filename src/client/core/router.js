this.router = options => {
    console.log('INIT ROUTER', options);
    let valid = false;
    let testEvalPath;
    try {
        testEvalPath = options.newPath;
    } catch (error) {
        testEvalPath = view.path;
    }
    if (testEvalPath == '') testEvalPath = '/';
    viewPaths.map((path, i) => {

        const testIncludesHome = path.homePaths.includes(testEvalPath);
        const validPath = path.path == testEvalPath || (path.paths && path.paths.includes(testEvalPath));
        // console.log('-------------------------------------');
        // console.warn('valid path', validPath);
        // console.log(testEvalPath, path.path, getURI());
        if (validPath) {
            valid = true;
            GLOBAL['lastTestEvalPath'] = newInstance(testEvalPath);
            if (testEvalPath != clearURI(getURI()) &&
                testEvalPath.split('/').filter(x => x[0] == ':').length === 0) {
                // console.warn('set uri', testEvalPath);
                setURI(testEvalPath);
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
                // fadeIn(s(path.component));
                s(path.component).style.display = 'block';
                if (GLOBAL[path.component] && GLOBAL[path.component].routerDisplay) GLOBAL[path.component].routerDisplay(options);
            };
        } else {
            // console.error('none uri:', testEvalPath, 'none comp:', path.component);
            s(path.component).style.display = 'none';
        }
    });
    if (!valid) location.href = testEvalPath;
    // console.error('redirect', testEvalPath, viewPaths) 
    // location.href = testEvalPath; 
    // console.error('redirect', testEvalPath) 
    // alert('redirect ' + testEvalPath) 
};

const buildBaseUri = () => dev ? `/${viewMetaData.clientID}` : '';

// Browser and App
// navigator button controller
window.onpopstate = e =>
    this.router({ newPath: getURI() });