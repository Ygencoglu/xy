// pool.js
const { Pool } = require('pg');

const pool = new Pool({
  user: 'yusuf',
  host: 'localhost',
  database: 'xy',
  password: '123',
  port: 5432,
});

module.exports = pool;
