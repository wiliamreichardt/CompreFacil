import test from 'node:test';
import assert from 'node:assert/strict';

const PAYMENT_URL = 'http://localhost:3001';
const NOTIFICATION_URL = 'http://localhost:3002';

const delay = (ms) =>
  new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    data: await response.json()
  };
}

async function waitFor(condition, timeout = 25000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      const result = await condition();

      if (result) return result;
    } catch (error) {
      // Continua tentando enquanto os serviços processam os eventos.
    }

    await delay(500);
  }

  throw new Error('Tempo limite excedido aguardando processamento.');
}

test('CompreFacil - Testes de integração', async (t) => {

  await t.test('Payment Service está online', async () => {
    const result = await getJson(`${PAYMENT_URL}/health`);

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'online');
  });

  await t.test('Notification Service está online', async () => {
    const result = await getJson(`${NOTIFICATION_URL}/health`);

    assert.equal(result.status, 200);
    assert.equal(result.data.status, 'online');
    assert.equal(result.data.database, 'connected');
  });

  await t.test('Pagamento com dados inválidos é rejeitado', async () => {
    const response = await fetch(`${PAYMENT_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerName: '',
        customerEmail: 'email-invalido',
        amount: -100
      })
    });

    const data = await response.json();

    assert.equal(response.status, 400);
    assert.ok(data.error);
  });

  await t.test('Pagamento válido é processado e notificado', async () => {

    const response = await fetch(`${PAYMENT_URL}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customerName: 'Teste Automatizado',
        customerEmail: 'teste@comprefacil.com',
        amount: 149.90
      })
    });

    const data = await response.json();

    assert.equal(response.status, 202);
    assert.ok(data.payment.id);

    const paymentId = data.payment.id;

    // Aguarda a confirmação do pagamento.
    const payment = await waitFor(async () => {
      const result = await getJson(
        `${PAYMENT_URL}/payments/${paymentId}`
      );

      return result.data.status === 'SUCCESS'
        ? result.data
        : null;
    });

    assert.equal(payment.status, 'SUCCESS');

    // Aguarda a chegada das duas notificações.
    const notificationResult = await waitFor(async () => {
      const result = await getJson(
        `${NOTIFICATION_URL}/notifications/${paymentId}`
      );

      const events = result.data.notifications || [];

      return events.length >= 2
        ? events
        : null;
    });

    const eventTypes = notificationResult.map(
      notification => notification.event_type
    );

    assert.ok(eventTypes.includes('payment.received'));
    assert.ok(eventTypes.includes('payment.confirmed'));

    assert.equal(notificationResult.length, 2);
  });

});
