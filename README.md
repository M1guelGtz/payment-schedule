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

## Subirla a internet (acceso desde cualquier lugar)

El servidor lee dos variables de entorno:

- `PORT` → puerto (lo asigna el hosting automáticamente).
- `DB_PATH` → ruta del archivo SQLite. **Apúntala a un disco persistente** del hosting
  para que la base de datos no se borre en cada reinicio.

### Opción recomendada: Render.com

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com) → **New → Web Service** y conecta el repo.
3. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Agrega un **Disk** (pestaña *Disks*), por ejemplo montado en `/data`.
5. En **Environment** agrega la variable `DB_PATH = /data/turnos.db`.
6. Deploy. Render te dará una URL pública tipo `https://turnos-pago.onrender.com`.

> Nota: sin un disco persistente, muchos hostings gratuitos borran el archivo SQLite al
> reiniciar. Por eso se usa `DB_PATH` apuntando a un disco montado.
