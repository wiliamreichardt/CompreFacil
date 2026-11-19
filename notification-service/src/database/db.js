
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USER || 'notifications',
  password: process.env.DB_PASSWORD || 'notifications123',
  database: process.env.DB_NAME || 'notifications'
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      payment_id UUID NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      customer_name VARCHAR(150) NOT NULL,
      customer_email VARCHAR(150) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      status VARCHAR(20) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_payment_event
        UNIQUE (payment_id, event_type)
    );
  `);

  console.log('Banco de notificações inicializado!');
}
