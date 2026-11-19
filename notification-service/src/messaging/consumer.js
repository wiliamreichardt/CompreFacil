
import amqp from 'amqplib';
import { pool } from '../database/db.js';

const EXCHANGE = 'payment.events';
const QUEUE = 'notification.events';

export async function startConsumer() {
  const connection = await amqp.connect(
    process.env.RABBITMQ_URL ||
    'amqp://comprefacil:comprefacil123@localhost:5672'
  );

  const channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE, 'topic', {
    durable: true
  });

  await channel.assertQueue(QUEUE, {
    durable: true
  });

  await channel.bindQueue(QUEUE, EXCHANGE, 'payment.received');
  await channel.bindQueue(QUEUE, EXCHANGE, 'payment.confirmed');

  channel.prefetch(1);

  console.log('Notification Service conectado ao RabbitMQ!');
  console.log('Aguardando mensagens...');

  await channel.consume(QUEUE, async (message) => {
    if (!message) return;

    try {
      const event = JSON.parse(message.content.toString());
      const eventType = message.fields.routingKey;

      await pool.query(
        `INSERT INTO notifications (
          payment_id,
          event_type,
          customer_name,
          customer_email,
          amount,
          status,
          message
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (payment_id, event_type) DO NOTHING`,
        [
          event.id,
          eventType,
          event.customerName,
          event.customerEmail,
          event.amount,
          event.status,
          event.message
        ]
      );

      console.log('\n========== NOTIFICAÇÃO ==========');
      console.log('Evento:', eventType);
      console.log('Cliente:', event.customerName);
      console.log('E-mail:', event.customerEmail);
      console.log('Valor: R$', event.amount);
      console.log('Status:', event.status);
      console.log('Mensagem:', event.message);
      console.log('=================================\n');

      // Confirma somente depois de salvar no banco.
      channel.ack(message);

    } catch (error) {
      console.error('Erro ao processar notificação:', error);

      // Devolve a mensagem à fila para nova tentativa.
      channel.nack(message, false, true);
    }
  });
}
