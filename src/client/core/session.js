

const validateSession = () =>
    localStorage.getItem('email') &&
    localStorage.getItem('username') &&
    localStorage.getItem('_b');