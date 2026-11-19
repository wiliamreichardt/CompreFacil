
import express from 'express';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';

import {
  pool,
  initializeDatabase
} from './database/db.js';

import {
  processOutbox
} from './workers/outbox.js';

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3001;

// Verificar funcionamento
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      service: 'payment-service',
      status: 'online',
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      service: 'payment-service',
      status: 'unavailable'
    });
  }
});

// Consultar pagamento
app.get('/payments/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Pagamento não encontrado'
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Erro ao consultar pagamento'
    });
  }
});

// Criar pagamento
app.post('/payments', async (req, res) => {
  const {
    customerName,
    customerEmail,
    amount
  } = req.body || {};

  if (
    typeof customerName !== 'string' ||
    !customerName.trim() ||
    typeof customerEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
    typeof amount !== 'number' ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return res.status(400).json({
      error: 'Informe nome, e-mail válido e valor positivo'
    });
  }

  const client = await pool.connect();

  const id = randomUUID();

  let payment;

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO payments (
        id,
        customer_name,
        customer_email,
        amount,
        status
      )
      VALUES ($1, $2, $3, $4, 'PENDING')
      RETURNING *`,
      [
        id,
        customerName.trim(),
        customerEmail.trim(),
        amount
      ]
    );

    payment = result.rows[0];

    const receivedEvent = {
      id: payment.id,
      customerName: payment.customer_name,
      customerEmail: payment.customer_email,
      amount: Number(payment.amount),
      status: 'PENDING',
      message: 'Solicitação de pagamento recebida'
    };

    await client.query(
      `INSERT INTO outbox_events (
        event_type,
        payload
      )
      VALUES ($1, $2::jsonb)`,
      [
        'payment.received',
        JSON.stringify(receivedEvent)
      ]
    );

    await client.query('COMMIT');

  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Erro ao criar pagamento:', error);

    return res.status(500).json({
      error: 'Não foi possível registrar o pagamento'
    });

  } finally {
    client.release();
  }

  // O pagamento e o evento já estão persistidos.
  res.status(202).json({
    message: 'Pagamento recebido e em processamento',
    payment
  });

  // Simulação acadêmica da confirmação.
  setTimeout(async () => {
    const confirmationClient = await pool.connect();

    try {
      await confirmationClient.query('BEGIN');

      const result = await confirmationClient.query(
        `UPDATE payments
         SET status = 'SUCCESS',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status = 'PENDING'
         RETURNING *`,
        [payment.id]
      );

      if (result.rows.length === 0) {
        await confirmationClient.query('ROLLBACK');
        return;
      }

      const confirmed = result.rows[0];

      const confirmedEvent = {
        id: confirmed.id,
        customerName: confirmed.customer_name,
        customerEmail: confirmed.customer_email,
        amount: Number(confirmed.amount),
        status: 'SUCCESS',
        message: 'Pagamento confirmado com sucesso'
      };

      await confirmationClient.query(
        `INSERT INTO outbox_events (
          event_type,
          payload
        )
        VALUES ($1, $2::jsonb)`,
        [
          'payment.confirmed',
          JSON.stringify(confirmedEvent)
        ]
      );

      await confirmationClient.query('COMMIT');

      console.log(
        'Pagamento confirmado e evento registrado na Outbox:',
        confirmed.id
      );

    } catch (error) {
      await confirmationClient.query('ROLLBACK');

      console.error('Erro na confirmação:', error);

    } finally {
      confirmationClient.release();
    }
  }, 2000);
});

// Inicialização
async function start() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(`Payment Service na porta ${PORT}`);
    });

    // Tenta publicar os eventos pendentes imediatamente
    // e continua verificando a cada 2 segundos.
    processOutbox();
    setInterval(processOutbox, 2000);

  } catch (error) {
    console.error('Erro ao iniciar Payment Service:', error);
    process.exit(1);
  }
}

start();
