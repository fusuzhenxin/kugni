// Run the production standalone server with local runtime configuration.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const web = path.join(root, 'web');
const output = path.join(web, '.next', 'standalone');
const standalone = fs.existsSync(path.join(output, 'web', 'server.js')) ? path.join(output, 'web') : output;
if (!fs.existsSync(path.join(standalone, 'server.js'))) throw new Error('Run npm run build in web first.');
require(path.join(web, 'node_modules', '@next', 'env')).loadEnvConfig(web, false);
fs.cpSync(path.join(web, 'public'), path.join(standalone, 'public'), { recursive: true });
fs.cpSync(path.join(web, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
process.env.PORT = process.env.PORT || '3001';
process.env.HOSTNAME = '127.0.0.1';
require(path.join(standalone, 'server.js'));
