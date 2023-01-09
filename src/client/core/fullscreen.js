

window._fullscreen = newInstance(checkFullScreen());

setInterval(() => {
    if (_fullscreen !== checkFullScreen()) {
        window._fullscreen = newInstance(checkFullScreen());
        if (_fullscreen === true) {
            viewPaths.map(pathData => {
                if (GLOBAL[pathData.component] && GLOBAL[pathData.component].onFullScreen) {
                    GLOBAL[pathData.component].onFullScreen();
                }
            });
        } else {
            viewPaths.map(pathData => {
                if (GLOBAL[pathData.component] && GLOBAL[pathData.component].offFullScreen) {
                    GLOBAL[pathData.component].offFullScreen();
                }
            })

        }
    }
});
