

const validateSession = () =>
    localStorage.getItem('expiresIn') &&
    localStorage.getItem('email') &&
    localStorage.getItem('username') &&
    localStorage.getItem('_b');


const validateSessionDisplayComponent = path =>
    !(path.session && (!validateSession()));

const closeSessionComponents = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    localStorage.removeItem('_b');
    htmls('main_menu', this.main_menu.init());
    htmls('session-top-bar', this.main_menu.renderSessionToBar());
    viewPaths.map(pathData => {
        if (s(pathData.component) && pathData.session) {
            s(pathData.component).style.display = 'none';
        }
    });
    GLOBAL['auth'] = false;
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

    GLOBAL['auth'] = true;
    return;
};

const buildBaseApiUri = () => {
    if (dev) return '';
    return API_URL;
};