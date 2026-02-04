const fs = require('fs');
const path = require('path');
const envLocal = path.join(__dirname, '..', '.env.local');
const envDefault = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(envLocal) ? envLocal : envDefault });

const app = require('./app');

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`SplitMint server running on http://localhost:${PORT}`);
});
