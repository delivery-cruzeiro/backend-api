// Verify the REAL shared lock and elapsed time, without calling any public API.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nominatimRequestQueue, closeNominatimQueue } from '../dist/lib/nominatim-request-queue.js';

if (!process.env.DATABASE_URL?.includes('dc-geocoding-postgres')) throw Error('Isolated database required');

if (process.argv[2] === '--worker') {
  const worker = process.argv[3];
  try {
    await Promise.allSettled([0, 1].map(job => nominatimRequestQueue.run(async () => {
      process.send({ event:'start', worker, job, time:Date.now() });
      try {
        await new Promise(resolve => setTimeout(resolve, worker === '0' && job === 0 ? 1300 : 120));
        if (worker === '1' && job === 0) throw Error('simulated provider failure');
      } finally { process.send({ event:'end', worker, job, time:Date.now() }); }
    })));
  } finally { await closeNominatimQueue(); process.disconnect(); }
} else {
  const events = [];
  await Promise.all([0, 1, 2].map(worker => new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(import.meta.url), ['--worker', String(worker)], { silent:true });
    child.on('message', event => events.push(event));
    child.on('error', reject);
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('exit', code => code === 0 ? resolve() : reject(Error(`worker exit ${code}`)));
  })));
  const starts = events.filter(e => e.event === 'start').sort((a,b) => a.time-b.time);
  assert.equal(starts.length, 6);
  const gaps = [];
  for (let i=1;i<starts.length;i++) {
    const previous = starts[i-1];
    const end = events.find(e => e.event === 'end' && e.worker === previous.worker && e.job === previous.job);
    assert.ok(end);
    const gap = starts[i].time-end.time;
    assert.ok(gap >= 1000, `Completion-to-next-start gap too short: ${gap}ms`);
    gaps.push(gap);
  }
  console.log(JSON.stringify({ result:'PASS', processes:3, simultaneousJobs:6,
    minimumCompletionToNextStartMs:Math.min(...gaps), gapsMs:gaps,
    verified:'serial processing, slow response, provider failure, continued queue' }));
}
