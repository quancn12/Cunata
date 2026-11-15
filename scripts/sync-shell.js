import fs from 'node:fs';

const text = fs.readFileSync('index.html', 'utf8');
const idx = text.indexOf('<script type="module">');
let html = text.slice(0, idx).trimEnd();
html = html.replace('href="styles/style.css"', 'href="../../styles/style.css"');
html += '\n\n  <!-- Entrypoint for modular application -->\n  <script type="module" src="./main.js"></script>\n</body>\n</html>\n';

fs.writeFileSync('src/app/shell.html', html, 'utf8');
console.log('Synchronized src/app/shell.html from index.html (bytes:', html.length, ')');
