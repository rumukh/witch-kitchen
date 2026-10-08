import { parentPort } from 'node:worker_threads';
import { runTask, type Task } from './tasks.js';

parentPort!.on('message', (msg: { id: number; task: Task }) => {
  try {
    parentPort!.postMessage({ id: msg.id, ok: true, rows: runTask(msg.task) });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, ok: false, error: (e as Error).stack });
  }
});
