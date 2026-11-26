'use strict';

const readyByPool = new WeakMap();

async function initialize(pool) {
  const { rows: [current] } = await pool.query(
    "SELECT to_regclass('contact_intelligence_suppressions') AS relation"
  );
  if (current?.relation) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(73156023)');
    await client.query(`CREATE TABLE IF NOT EXISTS contact_intelligence_suppressions(
      id BIGSERIAL PRIMARY KEY,contact_id BIGINT,email TEXT,source TEXT,reason TEXT,
      actor TEXT DEFAULT 'admin',created_at TIMESTAMPTZ DEFAULT NOW())`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function ensureContactSuppressionSchema(pool) {
  if (!readyByPool.has(pool)) {
    readyByPool.set(pool, initialize(pool).catch(error => {
      readyByPool.delete(pool);
      throw error;
    }));
  }
  return readyByPool.get(pool);
}

module.exports = { ensureContactSuppressionSchema };
