
import { pool } from '../database/db.js';
import { publishEvent } from '../messaging/rabbitmq.js';

let processing = false;

export async function processOutbox() {
  if (processing) return;

  processing = true;

  try {
    const result = await pool.query(`
      SELECT id, event_type, payload, attempts
      FROM outbox_events
      WHERE published_at IS NULL
        AND next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY created_at ASC
      LIMIT 20
    `);

    for (const event of result.rows) {
      try {
        await publishEvent(
          event.event_type,
          event.payload,
          event.id
        );

        await pool.query(
          `UPDATE outbox_events
           SET published_at = CURRENT_TIMESTAMP,
               attempts = attempts + 1,
               last_error = NULL
           WHERE id = $1`,
          [event.id]
        );

        console.log(`Evento ${event.id} publicado!`);

      } catch (error) {
        const attempts = Number(event.attempts) + 1;

        const delaySeconds = Math.min(
          2 ** attempts,
          60
        );

        await pool.query(
          `UPDATE outbox_events
           SET attempts = $2,
               last_error = $3,
               next_attempt_at =
                 CURRENT_TIMESTAMP + ($4 * INTERVAL '1 second')
           WHERE id = $1`,
          [
            event.id,
            attempts,
            error.message,
            delaySeconds
          ]
        );

        console.error(
          `Falha no evento ${event.id}. Nova tentativa em ${delaySeconds}s.`
        );

        break;
      }
    }

  } catch (error) {
    console.error('Erro no Outbox Worker:', error.message);

  } finally {
    processing = false;
  }
}
