

const validateSession = () =>
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
    if (dev) return;

    const requestResult = await serviceRequest(() => '/api/auth/session', {
        headers: {
            'Authorization': renderAuthBearer()
        }
    });
    console.warn('requestResult', requestResult, GLOBAL['auth']);
    if (requestResult.status == 'error' && GLOBAL['auth'] == true)
        return closeSessionComponents();
    if (requestResult.status == 'success')
        GLOBAL['auth'] = true;
};