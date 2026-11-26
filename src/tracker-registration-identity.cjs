'use strict';

function registrationDomain(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www[.]/, '').split('/')[0].trim()
    : '';
}

async function lockRegistrationDomain(db, domain) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['tracker-registration:domain:' + domain]);
}

async function findRegistration(db, domain, includeDeleted = false) {
  const { rows } = await db.query(`SELECT id, token, status FROM tracker_clients
    WHERE regexp_replace(lower(trim(domain)), '^www[.]', '')=$1
      AND ($2::boolean OR status IS DISTINCT FROM 'deleted')
    ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,id LIMIT 1`, [domain, includeDeleted]);
  return rows[0];
}

// Used by the admin and the Network workspace, both of which may return an existing private link.
async function reuseOrCreateRegistration(pool, domain, create) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await lockRegistrationDomain(db, domain);
    const existing = await findRegistration(db, domain);
    const account = existing || await create(db);
    await db.query('COMMIT');
    return { ...account, existing: Boolean(existing) };
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

module.exports = { registrationDomain, lockRegistrationDomain, findRegistration, reuseOrCreateRegistration };
