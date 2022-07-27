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



this.router();

// Browser and App
// navigator button controller
window.onpopstate = e =>
    this.router({ newPath: getURI() });