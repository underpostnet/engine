

const validateSession = () =>
    localStorage.getItem('email') &&
    localStorage.getItem('username') &&
    localStorage.getItem('_b');


const validateSessionDisplayComponent = path =>
    !(path.session && (!validateSession()));

const closeSessionComponents = () => {
    viewPaths.map(pathData => {
        if (s(pathData.component) && pathData.session) {
            s(pathData.component).style.display = 'none';
        }
    })
};