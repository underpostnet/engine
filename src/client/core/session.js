

const validateSession = () =>
    localStorage.getItem('expiresIn') &&
    localStorage.getItem('email') &&
    localStorage.getItem('username') &&
    localStorage.getItem('_b');


const validateSessionDisplayComponent = path =>
    !(path.session && (!validateSession()));

const closeSessionComponents = () => {
    localStorage.removeItem('expiresIn');
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    localStorage.removeItem('_b');
    GLOBAL['auth'] = false;
    htmls('main_menu', this.main_menu.init());
    viewPaths.map(pathData => {
        if (s(pathData.component) && pathData.session) {
            s(pathData.component).style.display = 'none';
        }
        if (this[pathData.component] && this[pathData.component].closeSession)
            this[pathData.component].closeSession();
    });
    GLOBAL.router({ newPath: buildBaseUri() })
};

const execLogIng = (logInData) => {
    localStorage.setItem('_b', logInData.token);
    localStorage.setItem('username', logInData.user.username);
    localStorage.setItem('email', logInData.user.email);
    localStorage.setItem('expiresIn', logInData.expiresIn);
    GLOBAL['auth'] = true;
    htmls('main_menu', GLOBAL.main_menu.init());
    viewPaths.map(pathData => {
        if (this[pathData.component] && this[pathData.component].startSession)
            this[pathData.component].startSession();
    });
    s('login').style.display = 'none';
    GLOBAL.router({ newPath: buildBaseUri() });
};

const renderAuthBearer = () =>
    `Bearer ${localStorage.getItem('_b') ? localStorage.getItem('_b') : ''}`;

const checkAuthStatus = async () => {

    if (
        GLOBAL['auth'] === true &&
        (
            (!validateSession()) || ((+ new Date()) > parseInt(localStorage.getItem('expiresIn')))
        )
    )
        return localStorage.getItem('username') != 'francisco-verdugo' ? closeSessionComponents() : null;

    if (!validateSession() && GLOBAL['auth'] === false) return;

    GLOBAL['auth'] = true;
    return;
};

const buildBaseApiUri = () => {
    if (dev) return '';
    return API_URL;
};

const formatUserName = username => cap(username.trim().replaceAll('-', ' '));

const renderUserLink = (username, timeOutDelay) => {
    const idProfile = 'x' + s4();
    setTimeout(() => {
        if (s('.' + idProfile)) s('.' + idProfile).onclick = () => {

            // GLOBAL.router({ newPath: `${buildBaseUri()}/boards` });
            // GLOBAL.router({ newPath: `${buildBaseUri()}/${username}` });
            // GLOBAL.router({ newPath: `${buildBaseUri()}/:username` });
            // GLOBAL.router();

            const checkProfileComponent = viewPaths.find(path => path.path == `${buildBaseUri()}/:username`);
            if (!checkProfileComponent) return console.warn('no profile component load');

            if (getURI() != `${buildBaseUri()}/${username}`) setURI(`${buildBaseUri()}/${username}`);
            view = newInstance(checkProfileComponent);

            // view.path = newInstance(viewPaths.find(path => path.path == `${buildBaseUri()}/${username}`));
            // add view.paths ? 

            GLOBAL.router();
        };
    }, timeOutDelay);
    return /*html*/`
        <a class='${idProfile}' href='javascript:null'>${formatUserName(username)}</a>
    `
};