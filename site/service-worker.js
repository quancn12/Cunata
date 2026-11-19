// Cunata Web Native Service Worker
// Build Digest: d1c6dc9d467bf86d
const BUILD_VERSION = 'v-d1c6dc9d467bf86d';
const CACHE_NAME_PREFIX = 'cunata-cache-';
const CACHE_NAME = 'cunata-cache-v-d1c6dc9d467bf86d';
const DEFAULT_PRECACHE_ENTRIES = [
  {
    "url": "index.html",
    "critical": true
  },
  {
    "url": "./",
    "critical": true
  },
  {
    "url": "admin/admin.css",
    "critical": true
  },
  {
    "url": "admin/index.js",
    "critical": true
  },
  {
    "url": "admin/main.js",
    "critical": true
  },
  {
    "url": "admin/types.js",
    "critical": true
  },
  {
    "url": "admin/view.js",
    "critical": true
  },
  {
    "url": "admin.html",
    "critical": false
  },
  {
    "url": "app/authoring.js",
    "critical": true
  },
  {
    "url": "app/exam-list.js",
    "critical": true
  },
  {
    "url": "app/index.js",
    "critical": true
  },
  {
    "url": "app/legacy.js",
    "critical": true
  },
  {
    "url": "app/main.js",
    "critical": true
  },
  {
    "url": "app/role-shell.js",
    "critical": true
  },
  {
    "url": "app/routes.js",
    "critical": true
  },
  {
    "url": "bank/index.js",
    "critical": true
  },
  {
    "url": "bank/transfer.js",
    "critical": true
  },
  {
    "url": "bank/types.js",
    "critical": true
  },
  {
    "url": "bank/view.css",
    "critical": true
  },
  {
    "url": "bank/view.js",
    "critical": true
  },
  {
    "url": "collect/appsScript.js",
    "critical": true
  },
  {
    "url": "collect/export.js",
    "critical": true
  },
  {
    "url": "collect/index.js",
    "critical": true
  },
  {
    "url": "collect/transport.js",
    "critical": true
  },
  {
    "url": "collect/types.js",
    "critical": true
  },
  {
    "url": "domain/examMax.js",
    "critical": true
  },
  {
    "url": "domain/index.js",
    "critical": true
  },
  {
    "url": "domain/judge.js",
    "critical": true
  },
  {
    "url": "domain/model.js",
    "critical": true
  },
  {
    "url": "domain/rational.js",
    "critical": true
  },
  {
    "url": "domain/scoreAttempt.js",
    "critical": true
  },
  {
    "url": "domain/serialize.js",
    "critical": true
  },
  {
    "url": "domain/shortAnswer.js",
    "critical": true
  },
  {
    "url": "domain/shuffle.js",
    "critical": true
  },
  {
    "url": "domain/validate.js",
    "critical": true
  },
  {
    "url": "import/docx/document-parser.js",
    "critical": true
  },
  {
    "url": "import/docx/index.js",
    "critical": true
  },
  {
    "url": "import/docx/numbering.js",
    "critical": true
  },
  {
    "url": "import/docx/omml.js",
    "critical": true
  },
  {
    "url": "import/docx/reader.js",
    "critical": true
  },
  {
    "url": "import/docx/rels.js",
    "critical": true
  },
  {
    "url": "import/docx/segmentation.js",
    "critical": true
  },
  {
    "url": "import/docx/types.js",
    "critical": true
  },
  {
    "url": "import/docx/xml-parser.js",
    "critical": true
  },
  {
    "url": "import/pdf/importer.js",
    "critical": true
  },
  {
    "url": "import/pdf/index.js",
    "critical": true
  },
  {
    "url": "import/pdf/inspector.js",
    "critical": true
  },
  {
    "url": "import/pdf/manual.js",
    "critical": true
  },
  {
    "url": "import/pdf/preview.js",
    "critical": true
  },
  {
    "url": "import/pdf/types.js",
    "critical": true
  },
  {
    "url": "import/preview/core.js",
    "critical": true
  },
  {
    "url": "import/preview/index.js",
    "critical": true
  },
  {
    "url": "import/preview/types.js",
    "critical": true
  },
  {
    "url": "import/preview/view.js",
    "critical": true
  },
  {
    "url": "import/zip/crc32.js",
    "critical": true
  },
  {
    "url": "import/zip/index.js",
    "critical": true
  },
  {
    "url": "import/zip/reader.js",
    "critical": true
  },
  {
    "url": "import/zip/types.js",
    "critical": true
  },
  {
    "url": "offline/index.js",
    "critical": true
  },
  {
    "url": "offline/service-worker.js",
    "critical": true
  },
  {
    "url": "offline/types.js",
    "critical": true
  },
  {
    "url": "public/config.json",
    "critical": true
  },
  {
    "url": "public/exams/hoa-repeating.json",
    "critical": true
  },
  {
    "url": "public/exams/index.json",
    "critical": true
  },
  {
    "url": "public/exams/ly-part-I.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de10/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p04-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p04-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p09-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p09-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p10-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10/p10-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de10.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de11/p01-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p02-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p03-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p03-5.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p05-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p05-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p06-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p06-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p08-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p08-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11/p09-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de11.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de12/c21-do-thi.svg",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p03-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12/p08-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de12.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de13/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p03-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p04-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p09-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13/p09-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de13.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de14/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de14.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de15/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p06-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de15.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de16/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p04-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16/p10-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de16.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de17/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p03-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de17.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de18/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p03-0.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de18.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de19/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de19.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de20/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de20/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de20/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de20/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de20.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de21/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p06-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de21.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de22/c11-dang-nhiet.svg",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p07-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de22.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de23/p01-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p01-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p03-4.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p04-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p04-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p04-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p05-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p09-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p10-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p10-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23/p10-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de23.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de24/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p02-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p06-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24/p09-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de24.json",
    "critical": true
  },
  {
    "url": "public/exams/ly12/de25/p01-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p01-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p02-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p02-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p03-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p03-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p03-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p04-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p05-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p06-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p07-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p08-1.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p08-2.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25/p08-3.png",
    "critical": false
  },
  {
    "url": "public/exams/ly12/de25.json",
    "critical": true
  },
  {
    "url": "public/exams/samples/sample-toan.json",
    "critical": true
  },
  {
    "url": "public/exams/toan-full.json",
    "critical": true
  },
  {
    "url": "public/fonts/google-sans-flex-latin-ext.woff2",
    "critical": false
  },
  {
    "url": "public/fonts/google-sans-flex-latin.woff2",
    "critical": false
  },
  {
    "url": "public/fonts/google-sans-flex-math.woff2",
    "critical": false
  },
  {
    "url": "public/fonts/google-sans-flex-symbols.woff2",
    "critical": false
  },
  {
    "url": "public/fonts/google-sans-flex-vietnamese.woff2",
    "critical": false
  },
  {
    "url": "public/fonts/OFL.txt",
    "critical": false
  },
  {
    "url": "public/q01-bbt.svg",
    "critical": true
  },
  {
    "url": "public/sample-exam.json",
    "critical": true
  },
  {
    "url": "report/download.js",
    "critical": true
  },
  {
    "url": "report/index.js",
    "critical": true
  },
  {
    "url": "report/print.css",
    "critical": true
  },
  {
    "url": "report/table.js",
    "critical": true
  },
  {
    "url": "report/types.js",
    "critical": true
  },
  {
    "url": "report/view.js",
    "critical": true
  },
  {
    "url": "schema/exam.js",
    "critical": true
  },
  {
    "url": "schema/index.js",
    "critical": true
  },
  {
    "url": "schema/types.js",
    "critical": true
  },
  {
    "url": "storage/backup.js",
    "critical": true
  },
  {
    "url": "storage/broadcast.js",
    "critical": true
  },
  {
    "url": "storage/index.js",
    "critical": true
  },
  {
    "url": "storage/migrate.js",
    "critical": true
  },
  {
    "url": "storage/types.js",
    "critical": true
  },
  {
    "url": "student/area.js",
    "critical": true
  },
  {
    "url": "student/index.js",
    "critical": true
  },
  {
    "url": "student/types.js",
    "critical": true
  },
  {
    "url": "student/view.css",
    "critical": true
  },
  {
    "url": "student/view.js",
    "critical": true
  },
  {
    "url": "styles/app.css",
    "critical": true
  },
  {
    "url": "styles/style.css",
    "critical": true
  },
  {
    "url": "teacher/index.js",
    "critical": true
  },
  {
    "url": "teacher/portal.js",
    "critical": true
  },
  {
    "url": "teacher/types.js",
    "critical": true
  },
  {
    "url": "teacher/view.css",
    "critical": true
  },
  {
    "url": "teacher/view.js",
    "critical": true
  },
  {
    "url": "ui/blocks.js",
    "critical": true
  },
  {
    "url": "ui/components.css",
    "critical": true
  },
  {
    "url": "ui/components.js",
    "critical": true
  },
  {
    "url": "ui/composition.js",
    "critical": true
  },
  {
    "url": "ui/dialog.js",
    "critical": true
  },
  {
    "url": "ui/icons.js",
    "critical": true
  },
  {
    "url": "ui/index.js",
    "critical": true
  },
  {
    "url": "ui/layout.css",
    "critical": true
  },
  {
    "url": "ui/layout.js",
    "critical": true
  },
  {
    "url": "ui/modal.js",
    "critical": true
  },
  {
    "url": "ui/mount.js",
    "critical": true
  },
  {
    "url": "ui/security.js",
    "critical": true
  },
  {
    "url": "ui/status.js",
    "critical": true
  },
  {
    "url": "ui/styles.js",
    "critical": true
  },
  {
    "url": "ui/tokens.css",
    "critical": true
  },
  {
    "url": "ui/types.js",
    "critical": true
  }
];

function resolveScopeUrl(scopeBase, relativePath) {
  const cleanBase = scopeBase.endsWith('/') ? scopeBase : (scopeBase + '/');
  const cleanPath = relativePath.startsWith('./') ? relativePath.slice(2) : (relativePath.startsWith('/') ? relativePath.slice(1) : relativePath);
  return cleanBase + cleanPath;
}

function isCacheableRequest(requestUrl, method) {
  if (method && method.toUpperCase() !== 'GET') return false;
  const lower = requestUrl.toLowerCase();
  if (lower.startsWith('chrome-extension:') || lower.startsWith('file:') || lower.startsWith('data:') || lower.startsWith('blob:')) return false;
  if (lower.includes('script.google.com') || lower.includes('macros.google.com') || lower.includes('script.googleusercontent.com')) return false;
  return true;
}

let isAttemptActive = false;
const clientActiveMap = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const scope = (self.registration && self.registration.scope) || '/';
    const CONCURRENCY = 16;
    let index = 0;
    let abortError = null;

    async function worker() {
      while (index < DEFAULT_PRECACHE_ENTRIES.length && !abortError) {
        const item = DEFAULT_PRECACHE_ENTRIES[index++];
        if (!item) break;
        const fullUrl = resolveScopeUrl(scope, item.url);
        try {
          const resp = await fetch(fullUrl, { cache: 'no-cache' });
          if (resp && resp.ok) {
            await cache.put(fullUrl, resp.clone());
            if (fullUrl !== item.url) await cache.put(item.url, resp);
          } else if (item.critical) {
            throw new Error('Critical asset failed: ' + item.url + ' status: ' + (resp ? resp.status : 'null'));
          }
        } catch (err) {
          if (item.critical) {
            abortError = err;
            try { await caches.delete(CACHE_NAME); } catch (_) {}
            throw err;
          }
        }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, DEFAULT_PRECACHE_ENTRIES.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    if (abortError) throw abortError;
  })());
});

async function checkClientsCanActivate() {
  if (!self.clients || !self.clients.matchAll) return !isAttemptActive;
  const windowClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  if (!windowClients || windowClients.length === 0) return true;

  const checks = windowClients.map((client) => {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Unknown or non-responsive client -> defer activation
          resolve({ responsive: false, active: true });
        }
      }, 600);

      const channel = new MessageChannel();
      channel.port1.onmessage = (ev) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            responsive: true,
            active: Boolean(ev.data && ev.data.active),
            cacheName: ev.data?.cacheName,
          });
        }
      };

      try {
        client.postMessage({ type: 'QUERY_ATTEMPT_ACTIVE' }, [channel.port2]);
      } catch (_) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ responsive: false, active: true });
        }
      }
    });
  });

  const statuses = await Promise.all(checks);
  const cannotActivate = statuses.some((s) => !s.responsive || s.active);
  return !cannotActivate;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const currentCache = await caches.open(CACHE_NAME);

    // Verify currentCache has essential shell and main.js before pruning old caches
    const hasIndex = (await currentCache.match('index.html')) || (await currentCache.match('./'));
    const hasMain = await currentCache.match('app/main.js');
    if (!hasIndex || !hasMain) {
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
      return;
    }

    // Preserve any cached entries from old caches into the new cache
    const keys = await caches.keys();
    const oldKeys = keys.filter((k) => k.startsWith(CACHE_NAME_PREFIX) && k !== CACHE_NAME);

    for (const oldKey of oldKeys) {
      try {
        const oldCache = await caches.open(oldKey);
        const oldRequests = await oldCache.keys();
        for (const req of oldRequests) {
          const hasReq = await currentCache.match(req);
          if (!hasReq) {
            const resp = await oldCache.match(req);
            if (resp) {
              await currentCache.put(req, resp);
            }
          }
        }
      } catch (_) {}
    }

    // Check which clients are currently open and which caches they might still be referencing
    const windowClients = (self.clients && self.clients.matchAll)
      ? await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      : [];

    const activeCachesInUse = new Set([CACHE_NAME]);
    if (windowClients.length > 0) {
      const clientChecks = windowClients.map((client) => {
        return new Promise((resolve) => {
          let done = false;
          const timer = setTimeout(() => {
            if (!done) { done = true; resolve(null); }
          }, 300);
          const channel = new MessageChannel();
          channel.port1.onmessage = (ev) => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              resolve(ev.data?.cacheName || null);
            }
          };
          try {
            client.postMessage({ type: 'QUERY_CACHE_IN_USE' }, [channel.port2]);
          } catch (_) {
            if (!done) { done = true; clearTimeout(timer); resolve(null); }
          }
        });
      });
      const inUseList = await Promise.all(clientChecks);
      for (const name of inUseList) {
        if (name && typeof name === 'string' && name.startsWith(CACHE_NAME_PREFIX)) {
          activeCachesInUse.add(name);
        }
      }
    }

    // Only delete old caches that are NOT in use by any open client
    for (const k of oldKeys) {
      if (!activeCachesInUse.has(k)) {
        await caches.delete(k);
      }
    }

    if (self.clients && self.clients.claim) {
      await self.clients.claim();
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SET_ATTEMPT_ACTIVE') {
    isAttemptActive = Boolean(data.active);
    const clientId = (event.source && event.source.id) || data.clientId;
    if (clientId) {
      clientActiveMap.set(clientId, isAttemptActive);
    }
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type: 'ATTEMPT_STATUS_ACK', active: isAttemptActive });
    }
  } else if (data.type === 'SKIP_WAITING') {
    event.waitUntil((async () => {
      const canActivate = await checkClientsCanActivate();
      if (!canActivate) {
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({ type: 'UPDATE_DEFERRED_REPORT', active: true });
        }
        return;
      }
      self.skipWaiting();
    })());
  } else if (data.type === 'CHECK_OFFLINE_READY') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const reqUrls = data.requiredUrls || DEFAULT_PRECACHE_ENTRIES.filter((i) => i.critical).map((i) => i.url);
      const missingUrls = [];
      let cachedCount = 0;
      for (const u of reqUrls) {
        const match = (await cache.match(u)) || (await cache.match(resolveScopeUrl((self.registration && self.registration.scope) || '/', u)));
        if (match) {
          cachedCount++;
        } else {
          missingUrls.push(u);
        }
      }
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          type: 'OFFLINE_READY_REPORT',
          ready: missingUrls.length === 0,
          cachedCount,
          totalCount: reqUrls.length,
          missingUrls,
        });
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!isCacheableRequest(req.url, req.method)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(req)) || (await cache.match(req.url));
    const pathname = new URL(req.url).pathname;
    const mutableMetadata = pathname.endsWith('/public/config.json') || pathname.endsWith('/public/exams/index.json');
    if (mutableMetadata) {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          try { await cache.put(req, fresh.clone()); } catch (_) {}
        }
        return fresh;
      } catch (_) {
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    }
    if (cached) return cached;
    try {
      const network = await fetch(req);
      if (network && network.ok && req.method === 'GET') {
        cache.put(req, network.clone()).catch(() => {});
      }
      return network;
    } catch (_) {
      const isNav = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('.html');
      if (isNav) {
        const fallback =
          (await cache.match('index.html')) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await cache.match('/'));
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
