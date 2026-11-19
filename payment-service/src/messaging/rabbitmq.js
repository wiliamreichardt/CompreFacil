
import amqp from 'amqplib';

const EXCHANGE = 'payment.events';

let connection = null;
let channel = null;

async function getChannel() {
  if (channel) {
    return channel;
  }

  const url =
    process.env.RABBITMQ_URL ||
    'amqp://comprefacil:comprefacil123@localhost:5672';

  connection = await amqp.connect(url);

  connection.on('close', () => {
    console.log('RabbitMQ desconectado. Tentará reconectar.');
    connection = null;
    channel = null;
  });

  connection.on('error', (error) => {
    console.error('Erro RabbitMQ:', error.message);
  });

  channel = await connection.createConfirmChannel();

  await channel.assertExchange(EXCHANGE, 'topic', {
    durable: true
  });

  console.log('Conectado ao RabbitMQ!');

  return channel;
}

export async function publishEvent(routingKey, data, messageId) {
  const currentChannel = await getChannel();

  currentChannel.publish(
    EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(data)),
    {
      persistent: true,
      contentType: 'application/json',
      messageId: String(messageId)
    }
  );

  await currentChannel.waitForConfirms();

  console.log('Evento confirmado pelo RabbitMQ:', routingKey);
}
