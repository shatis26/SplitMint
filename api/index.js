const fs = require('fs');
const path = require('path');
const envLocal = path.join(__dirname, '..', '.env.local');
const envDefault = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envDefault });

const serverless = require('serverless-http');
const app = require('../server/app');

module.exports = serverless(app);
