const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Base de datos SQLite ---
// La ruta se puede sobreescribir con DB_PATH (útil para montar un volumen en el hosting).
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'turnos.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// --- Esquema: servicios (cada uno con su rotación y ronda independientes) ---
db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    round    INTEGER NOT NULL DEFAULT 1,
    position INTEGER NOT NULL
  );
`);

// --- Migración desde el esquema viejo (participants sin service_id + settings.round) ---
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
if (tables.includes('participants')) {
  const cols = db.prepare('PRAGMA table_info(participants)').all().map(c => c.name);
  if (!cols.includes('service_id')) {
    const roundRow = tables.includes('settings')
      ? db.prepare("SELECT value FROM settings WHERE key = 'round'").get()
      : null;
    const oldRound = roundRow ? parseInt(roundRow.value, 10) || 1 : 1;

    const migrate = db.transaction(() => {
      const info = db.prepare("INSERT INTO services (name, round, position) VALUES ('General', ?, 1)").run(oldRound);
      const sid = info.lastInsertRowid;
      db.exec('ALTER TABLE participants RENAME TO participants_old');
      db.exec(`CREATE TABLE participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        position INTEGER NOT NULL,
        paid INTEGER NOT NULL DEFAULT 0
      )`);
      db.prepare('INSERT INTO participants (service_id, name, position, paid) SELECT ?, name, position, paid FROM participants_old')
        .run(sid);
      db.exec('DROP TABLE participants_old');
      db.exec('DROP TABLE IF EXISTS settings');
    });
    migrate();
    console.log('✔ Datos migrados al servicio "General".');
  }
}

// Asegura la tabla nueva (primer arranque sin datos viejos)
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id INTEGER NOT NULL,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL,
    paid       INTEGER NOT NULL DEFAULT 0
  );
`);

// --- Helpers ---
const pplStmt = db.prepare('SELECT id, name, paid FROM participants WHERE service_id = ? ORDER BY position ASC, id ASC');

function getServices() {
  const svcs = db.prepare('SELECT id, name, round, position FROM services ORDER BY position ASC, id ASC').all();
  return svcs.map(s => {
    const people = pplStmt.all(s.id).map(p => ({ id: p.id, name: p.name, paid: !!p.paid }));
    const current = people.find(p => !p.paid); // turno = primer pendiente por orden
    return {
      id: s.id,
      name: s.name,
      round: s.round,
      people,
      currentId: current ? current.id : null
    };
  });
}

function serviceExists(id) {
  return !!db.prepare('SELECT 1 FROM services WHERE id = ?').get(id);
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API: servicios ---
app.get('/api/services', (req, res) => {
  res.json({ services: getServices() });
});

app.post('/api/services', (req, res) => {
  const name = (req.body && req.body.name || '').toString().trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'El servicio necesita un nombre' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM services').get().m;
  const info = db.prepare('INSERT INTO services (name, round, position) VALUES (?, 1, ?)').run(name, maxPos + 1);
  res.json({ services: getServices(), createdId: info.lastInsertRowid });
});

app.patch('/api/services/:id', (req, res) => {
  const name = (req.body && req.body.name || '').toString().trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Nombre inválido' });
  db.prepare('UPDATE services SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ services: getServices() });
});

app.delete('/api/services/:id', (req, res) => {
  const del = db.transaction((id) => {
    db.prepare('DELETE FROM participants WHERE service_id = ?').run(id);
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
  });
  del(req.params.id);
  res.json({ services: getServices() });
});

// --- API: participantes de un servicio ---
app.post('/api/services/:id/people', (req, res) => {
  const sid = req.params.id;
  if (!serviceExists(sid)) return res.status(404).json({ error: 'Servicio no encontrado' });
  const name = (req.body && req.body.name || '').toString().trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM participants WHERE service_id = ?').get(sid).m;
  db.prepare('INSERT INTO participants (service_id, name, position, paid) VALUES (?, ?, ?, 0)').run(sid, name, maxPos + 1);
  res.json({ services: getServices() });
});

app.delete('/api/people/:id', (req, res) => {
  db.prepare('DELETE FROM participants WHERE id = ?').run(req.params.id);
  res.json({ services: getServices() });
});

// --- API: marcar/desmarcar el pago de UNA persona (check individual, reversible) ---
// No cambia la ronda: solo alterna el estado. Así se corrige fácil una ausencia
// o una compensación entre compañeros sin efectos secundarios sorpresa.
app.post('/api/people/:id/toggle', (req, res) => {
  const row = db.prepare('SELECT id, paid FROM participants WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Participante no encontrado' });
  const nowPaid = row.paid ? 0 : 1;
  db.prepare('UPDATE participants SET paid = ? WHERE id = ?').run(nowPaid, row.id);
  res.json({ services: getServices(), personId: row.id, nowPaid: !!nowPaid });
});

// --- API: cerrar la ronda actual e iniciar la siguiente (acción explícita) ---
app.post('/api/services/:id/new-round', (req, res) => {
  const sid = req.params.id;
  const svc = db.prepare('SELECT round FROM services WHERE id = ?').get(sid);
  if (!svc) return res.status(404).json({ error: 'Servicio no encontrado' });
  const round = svc.round + 1;
  const bump = db.transaction(() => {
    db.prepare('UPDATE services SET round = ? WHERE id = ?').run(round, sid);
    db.prepare('UPDATE participants SET paid = 0 WHERE service_id = ?').run(sid);
  });
  bump();
  res.json({ services: getServices(), round });
});

// --- API: reiniciar la ronda actual (desmarca todos, sin cambiar el número) ---
app.post('/api/services/:id/reset-round', (req, res) => {
  db.prepare('UPDATE participants SET paid = 0 WHERE service_id = ?').run(req.params.id);
  res.json({ services: getServices() });
});

app.listen(PORT, () => {
  console.log(`\n🎟  Turnero corriendo en http://localhost:${PORT}`);
  console.log(`   Base de datos: ${DB_PATH}\n`);
});
