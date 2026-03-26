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

// file-type@21.x changes: subpath './core.js' -> './core', no default export,
// and 'fromBuffer' renamed to 'fileTypeFromBuffer'
const patchCyberiaDependencies = (fs) => {
  // Patch ESM
  const esmPath = 'node_modules/@jimp/core/dist/esm/index.js';
  if (fs.existsSync(esmPath)) {
    let content = fs.readFileSync(esmPath, 'utf8');
    if (content.includes('file-type/core.js') || content.includes('from "file-type/core"')) {
      content = content
        .replace(
          /import fileType from ["']file-type\/core(?:\.js)?["'];/,
          'import { fileTypeFromBuffer as _ftFromBuffer } from "file-type/core";',
        )
        .replaceAll('fileType.fromBuffer(', '_ftFromBuffer(');
      fs.writeFileSync(esmPath, content, 'utf8');
    }
  }
  // Patch CommonJS
  const cjsPath = 'node_modules/@jimp/core/dist/commonjs/index.js';
  if (fs.existsSync(cjsPath)) {
    let content = fs.readFileSync(cjsPath, 'utf8');
    if (content.includes('file-type/core.js') || content.includes('file-type/core')) {
      content = content
        .replace(/require\(["']file-type\/core(?:\.js)?["']\)/, 'require("file-type/core")')
        .replaceAll('core_js_1.default.fromBuffer(', 'core_js_1.fileTypeFromBuffer(');
      fs.writeFileSync(cjsPath, content, 'utf8');
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
