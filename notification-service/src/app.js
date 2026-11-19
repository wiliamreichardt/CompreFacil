
import express from 'express';
import dotenv from 'dotenv';

import {
  initializeDatabase,
  pool
} from './database/db.js';

import {
  startConsumer
} from './messaging/consumer.js';

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3002;

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      service: 'notification-service',
      status: 'online',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      service: 'notification-service',
      status: 'unavailable',
      database: 'disconnected'
    });
  }
});

// Consultar todas as notificações
app.get('/notifications', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       ORDER BY created_at DESC`
    );

    res.json({
      total: result.rowCount,
      notifications: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Erro ao consultar notificações'
    });
  }
});

// Consultar notificações de um pagamento
app.get('/notifications/:paymentId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE payment_id = $1
       ORDER BY created_at ASC`,
      [req.params.paymentId]
    );

    res.json({
      total: result.rowCount,
      notifications: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Erro ao consultar notificações'
    });
  }
});

async function start() {
  try {
    await initializeDatabase();
    await startConsumer();

    app.listen(PORT, () => {
      console.log(
        `Notification Service na porta ${PORT}`
      );
    });

  } catch (error) {
    console.error(
      'Erro ao iniciar Notification Service:',
      error
    );

    process.exit(1);
  }
}

start();
