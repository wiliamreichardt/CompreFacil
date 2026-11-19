
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'comprefacil',
  password: process.env.DB_PASSWORD || 'comprefacil123',
  database: process.env.DB_NAME || 'comprefacil'
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      customer_name VARCHAR(150) NOT NULL,
      customer_email VARCHAR(150) NOT NULL,
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS outbox_events (
      id BIGSERIAL PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP NULL,
      attempts INTEGER DEFAULT 0,
      last_error TEXT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox_events (created_at)
    WHERE published_at IS NULL;
  `);

  console.log('Banco de pagamentos e Outbox inicializados!');
}
