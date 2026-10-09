import 'dotenv/config';
import { embeddingWorker } from '../src/lib/worker';

console.log('----------------------------------------------------');
console.log('FindMine Background BullMQ Worker Process Started!');
console.log(`Redis: ${process.env.REDIS_URL ? 'Connected (Upstash)' : 'Using Default Localhost'}`);
console.log('Listening for generate-embeddings queue jobs...');
console.log('----------------------------------------------------');

// Keep process alive
process.on('SIGTERM', () => {
  console.log('Worker shutting down...');
  embeddingWorker.close();
});
