/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.agentmesh.app',
  productName: 'AgentMesh',
  directories: {
    output: 'release',
  },
  files: [
    { from: 'out', to: 'out' },
    'package.json',
  ],
  extraResources: [
    { from: 'node_modules/sql.js/dist/sql-wasm.wasm', to: 'sql-wasm.wasm' },
    { from: 'skills', to: 'skills' },
    { from: 'build/icons/icon.png', to: 'icon.png' },
  ],
  extraMetadata: {
    main: 'out/main/main.js',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64'] }],
  },
}
