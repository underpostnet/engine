const ModelElement = {
  user: () => {
    return {
      user: {
        _id: '',
      },
    };
  },
};

const BaseElement = () => {
  return {
    user: {
      main: {
        model: {
          ...ModelElement.user(),
        },
      },
    },
    chat: {},
    mailer: {},
  };
};

const CyberiaPortalParams = {
  EVENT_CALLBACK_TIME: 45,
};

const CyberiaDependencies = {
  'maxrects-packer': '^2.7.3',
  pngjs: '^7.0.0',
  jimp: '^1.6.0',
  sharp: '^0.34.5',
  ethers: '~6.16.0',
};

const CyberiaDependenciesOverrides = {
  jimp: {
    '@jimp/core': {
      'file-type': '21.3.4',
    },
  },
};

// file-type@21.x exports './core' but @jimp/core imports 'file-type/core.js'
// patch the import to use the correct subpath export
const patchCyberiaDependencies = (fs) => {
  const patches = ['node_modules/@jimp/core/dist/esm/index.js', 'node_modules/@jimp/core/dist/commonjs/index.js'];
  for (const filePath of patches) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('file-type/core.js')) {
        fs.writeFileSync(filePath, content.replaceAll('file-type/core.js', 'file-type/core'), 'utf8');
      }
    }
  }
};

export {
  BaseElement,
  ModelElement,
  CyberiaPortalParams,
  CyberiaDependencies,
  CyberiaDependenciesOverrides,
  patchCyberiaDependencies,
};
