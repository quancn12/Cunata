// Node 24 resolves an explicit directory argument as a module entrypoint.
// Keep the task's exact command working without changing package.json.
import './api.test.mjs';
import './browser.test.mjs';
