const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const config = getDefaultConfig(projectRoot);
const speechCompatPath = path.resolve(projectRoot, 'src/services/speechRecognitionCompat.js');

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-speech-recognition') {
    return {
      filePath: speechCompatPath,
      type: 'sourceFile'
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
