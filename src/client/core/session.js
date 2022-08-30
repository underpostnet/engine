

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

const renderAuthBearer = () =>
    `Bearer ${localStorage.getItem('_b') ? localStorage.getItem('_b') : ''}`;

const checkAuthStatus = async () => {

    if (
        GLOBAL['auth'] === true &&
        (
            (!validateSession()) || ((+ new Date()) > parseInt(localStorage.getItem('expiresIn')))
        )
    )
        return closeSessionComponents();

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
            // GLOBAL.router({ newPath: buildBaseUri() + '/:username' });
            setURI(`${buildBaseUri()}/${username}`);
            GLOBAL.router();
        };
    }, timeOutDelay);
    return /*html*/`
        <a class='${idProfile}' href='javascript:void(0)'>
            ${formatUserName(username)}
        </a>
    `
};