// Node 24 treats an explicit directory argument as a module entrypoint.
// Keep the task's required `node --test ops/roadmap/tests/R2/` command usable.
import './r2.test.mjs';
