const endpointFactory = (meta, path = '') => {
  const data = meta.url.split('/');
  data.pop();
  if (path === '/') path = '';
  return `${path}/${data.pop()}`;
};

export { endpointFactory };
