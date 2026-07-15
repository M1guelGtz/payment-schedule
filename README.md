# 💸 Turnos de Pago

App web para gestionar los turnos de pago entre compañeros: un día paga uno, otro día
otro, con check de "ya pagó" y control de rondas. Los datos se guardan en una base de
datos **SQLite** a través de un servidor **Node.js + Express**.

## Correr en tu PC

```bash
npm install
npm start
```

Luego abre http://localhost:3000 en el navegador. La base de datos se crea sola en el
archivo `turnos.db`.

## Estructura

```
turnos-pago/
├── server.js         → servidor + API + SQLite
├── public/
│   └── index.html    → interfaz (la app)
├── turnos.db         → base de datos (se crea automáticamente)
└── package.json
```

## API

| Método | Ruta                | Qué hace                                    |
|--------|---------------------|---------------------------------------------|
| GET    | `/api/state`        | Estado actual (personas, ronda, turno)      |
| POST   | `/api/people`       | Agrega compañero `{ "name": "Ana" }`        |
| DELETE | `/api/people/:id`   | Elimina un compañero                        |
| POST   | `/api/pay`          | Marca el pago del turno actual y avanza     |
| POST   | `/api/reset-round`  | Desmarca los pagos de la ronda actual       |
| POST   | `/api/reset-all`    | Borra todo y reinicia                       |

## Despliegue: backend en Railway + frontend en Vercel

El servidor lee estas variables de entorno:

| Variable      | Para qué                                                                 |
|---------------|--------------------------------------------------------------------------|
| `PORT`        | Puerto. Railway lo asigna solo — no lo toques.                           |
| `DB_PATH`     | Ruta del archivo SQLite. **Apúntala a un Volume** para que no se borre.  |
| `CORS_ORIGIN` | Dominio del front autorizado (ej. `https://tu-app.vercel.app`). Def: `*` |
| `APP_PIN`     | PIN compartido para entrar. Sin definir = app abierta (sin PIN).         |

### Orden recomendado

Primero el backend (para tener su URL), luego el frontend.

### A) Backend en Railway

1. Sube esta carpeta a un repositorio de **GitHub**.
2. En [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** y elige el repo.
   Railway detecta Node por `package.json` y usa `npm install` + `npm start` automáticamente.
3. **Agrega un Volume** (clic derecho en el servicio → *Add Volume*), con **Mount path** = `/data`.
   Esto es lo que hace que la base SQLite **sobreviva** a los reinicios y redeploys.
4. En **Variables** agrega:
   - `DB_PATH` = `/data/turnos.db`
   - `APP_PIN` = el PIN que compartirás con el equipo (ej. `4726`). Omítelo para dejarla abierta.
   - (más tarde) `CORS_ORIGIN` = la URL de tu front en Vercel.
5. En **Settings → Networking → Generate Domain** para obtener una URL pública, ej.
   `https://turnos-pago-production.up.railway.app`. **Cópiala.**

### B) Frontend en Vercel

La URL del backend se inyecta como **variable de entorno** `API_BASE`. En el build,
`scripts/build-config.js` genera `public/config.js` con ese valor (nada hardcodeado).
El `vercel.json` ya deja configurado el build y la carpeta de salida.

1. En [vercel.com](https://vercel.com) → **Add New → Project**, elige el mismo repo.
2. Deja **Root Directory** en la raíz del repo (NO `public`; el `vercel.json` ya apunta
   la salida a `public`). Framework Preset: *Other*.
3. En **Settings → Environment Variables** agrega:
   - `API_BASE` = tu URL de Railway (ej. `https://turnos-pago-production.up.railway.app`).
4. Deploy. Vercel corre `node scripts/build-config.js`, genera el `config.js` con tu URL
   y publica. Te da un dominio tipo `https://turnos-pago.vercel.app`.

> Si más adelante cambias la URL del backend, solo edita la variable `API_BASE` en Vercel
> y vuelve a desplegar (**Redeploy**). No tocas código.

Para probar el build localmente: `API_BASE="https://tu-backend" npm run build:config`.

### C) Cerrar el candado (CORS)

Vuelve a Railway → **Variables** → pon `CORS_ORIGIN` = tu URL de Vercel y redeploy.
Así solo tu front podrá hablar con el backend.

> **Nota sobre tus datos locales:** `turnos.db` está en `.gitignore`, así que NO se sube.
> En Railway se crea una base nueva y vacía sobre el Volume. Tus servicios locales
> (COCACOLA, etc.) se quedan en tu PC; en producción empiezas limpio.

### Alternativa más simple (todo en Railway, sin Vercel)

Como el backend ya sirve el front (`express.static`), puedes desplegar **solo** en Railway
dejando `config.js` con `API_BASE = ""` y abrir directamente la URL de Railway. Un solo
servicio, sin CORS. Vercel se justifica si quieres CDN/dominio propio para el front.
