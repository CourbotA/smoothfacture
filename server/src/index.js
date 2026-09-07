import { openDatabase } from './database.js';
import { InvoiceRepository } from './invoiceRepository.js';
import { createHttpServer } from './httpServer.js';

const port = Number.parseInt(process.env.PORT || '35457', 10);
const host = process.env.HOST || '0.0.0.0';
const database = openDatabase();
const repository = new InvoiceRepository(database);
const server = createHttpServer(repository);

server.listen(port, host, () => {
  console.log(`SmoothFacture API listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
