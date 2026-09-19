const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const babel = require('@rollup/plugin-babel');
const terser = require('@rollup/plugin-terser');
const postcss = require('rollup-plugin-postcss');
const replace = require('@rollup/plugin-replace');
const pkg = require('./package.json');

const replacePlugin = replace({
  preventAssignment: true,
  values: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify(pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''))
  }
});

const createBabelPlugin = (jsxRuntime) => babel({
  babelHelpers: 'bundled',
  exclude: 'node_modules/**',
  presets: [
    ['@babel/preset-env', { modules: false }],
    ['@babel/preset-react', { runtime: jsxRuntime }]
  ],
  extensions: ['.js', '.jsx']
});

const sharedPlugins = [
  replacePlugin,
  resolve({
    browser: true,
    extensions: ['.js', '.jsx']
  }),
  commonjs({
    include: 'node_modules/**',
    exclude: ['src/**']
  })
];

const postcssPlugin = (extract) => postcss({
  extract,
  minimize: true,
  modules: {
    generateScopedName: '[hash:base64:8]'
  }
});

const isExternal = (id) => (
  id === 'react' ||
  id === 'react-dom' ||
  id === 'react/jsx-runtime' ||
  id === 'react/jsx-dev-runtime' ||
  id === 'js-tiktoken' ||
  id.startsWith('js-tiktoken/')
);

const isExternalUmd = (id) => (
  id === 'react' ||
  id === 'react-dom' ||
  id === 'js-tiktoken' ||
  id.startsWith('js-tiktoken/')
);

module.exports = [
  // CommonJS build (.cjs so "type": "module" does not treat it as ESM)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true
    },
    plugins: [
      postcssPlugin('chat-widget.css'),
      ...sharedPlugins,
      createBabelPlugin('automatic')
    ],
    external: isExternal
  },
  // ES module build (paths with .js for webpack 5 fullySpecified resolution)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      exports: 'named',
      sourcemap: true,
      paths: (id) => {
        if (id === 'react/jsx-runtime') return 'react/jsx-runtime.js';
        if (id === 'react/jsx-dev-runtime') return 'react/jsx-dev-runtime.js';
        return id;
      }
    },
    plugins: [
      postcssPlugin('chat-widget.css'),
      ...sharedPlugins,
      createBabelPlugin('automatic'),
      terser()
    ],
    external: isExternal
  },
  // UMD build (classic JSX so it maps to React.createElement, not a missing jsxRuntime global)
  {
    input: 'src/index.js',
    output: {
      name: 'AIChatWidget',
      file: 'dist/index.umd.js',
      format: 'umd',
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM'
      },
      exports: 'named',
      sourcemap: true
    },
    plugins: [
      postcssPlugin('chat-widget.css'),
      ...sharedPlugins,
      createBabelPlugin('classic'),
      terser()
    ],
    external: isExternalUmd
  }
];
