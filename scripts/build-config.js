// Genera public/config.js a partir de la variable de entorno API_BASE.
// Vercel ejecuta este script en el build; así la URL del backend NO va hardcodeada.
const fs = require('fs');
const path = require('path');

const apiBase = (process.env.API_BASE || '').replace(/\/+$/, '');
const out =
`// ⚙️ Archivo GENERADO automáticamente en el build (no lo edites a mano).
// Su valor viene de la variable de entorno API_BASE.
window.API_BASE = ${JSON.stringify(apiBase)};
`;

const target = path.join(__dirname, '..', 'public', 'config.js');
fs.writeFileSync(target, out);
console.log('✔ config.js generado con API_BASE =', apiBase || '(vacío → mismo origen)');
