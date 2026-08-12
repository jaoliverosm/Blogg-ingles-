# 📖 Blog Inglés II — Universidad del Tolima

Blog académico colaborativo para la materia **Inglés II** (Universidad del Tolima).
Frontend 100% estático (HTML + CSS + JS puro) alojado gratis en **GitHub Pages**,
con backend en **Firebase** (Authentication + Firestore + Storage). Sin servidor propio
y sin build: subes los archivos y funciona.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Vista pública del blog: todas las entradas, más recientes primero |
| `login.html` | Inicio de sesión con correo y contraseña |
| `crear.html` | Página protegida para publicar (redirige a `login.html` sin sesión) |
| `style.css` | Diseño (tema claro/oscuro, responsive) |
| `firebase-config.js` | **Aquí pegas tus credenciales** (placeholders) |
| `app.js` | Toda la lógica: login, logout, leer y publicar, subir imágenes |

---

## 1. Configurar Firebase (una sola vez)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com) → **Agregar proyecto**.
   Ponle un nombre (ej. `blog-ingles-ii`), puedes desactivar Google Analytics → **Crear proyecto**.

### 1.1 Authentication
- Menú lateral → **Build → Authentication** → **Comenzar**.
- Pestaña **Sign-in method** → activa **Correo electrónico/contraseña**.
- Pestaña **Users** → crea manualmente los **4 usuarios** (tú + 3 compañeros) con su correo y contraseña temporal.

### 1.2 Firestore
- **Build → Firestore Database** → **Crear base de datos** → **Modo de producción** → elige la región más cercana (ej. `southamerica-east1`).
- Pestaña **Reglas** → reemplaza con:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /entradas/{entrada} {
      allow read: if true;
      allow create: if request.auth != null;
    }
  }
}
```

> Nota: estas reglas permiten **leer a todos** y **crear solo con sesión** (lo que necesita el blog).
> Si más adelante quieres editar/borrar entradas desde la app, habría que agregar `allow update/delete`.

### 1.3 Storage
- **Build → Storage** → **Comenzar** → modo producción.
- Pestaña **Reglas** → reemplaza con:

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /entradas/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

> Las imágenes se suben a la carpeta `entradas/`, que es justo la que permiten estas reglas.

### 1.4 Credenciales
- **Configuración del proyecto** (engranaje) → **Tus apps** → ícono Web `</>`.
- Ponle un apodo (ej. `blog-web`), NO marques Firebase Hosting.
- Copia el objeto `firebaseConfig` y pégalo en `firebase-config.js`, reemplazando los `PON_AQUI_...`.

---

## 2. Subir a GitHub Pages

1. Crea un repo nuevo en GitHub (público o privado).
2. Sube los 6 archivos: `index.html`, `login.html`, `crear.html`, `style.css`, `firebase-config.js`, `app.js`.
3. Repo → **Settings → Pages** → en *Source* elige la rama `main` y carpeta `/root` → **Save**.
4. En unos minutos tu blog queda en `https://tuusuario.github.io/nombre-repo`.

---

## 3. Compartir con el grupo

Pasa a tus compañeros solo:
- el link del blog, y
- su correo + contraseña (los creaste en el paso 1.1).

Ellos entran a la URL, inician sesión y publican desde `crear.html` sin tocar código ni terminal.

---

## Notas técnicas

- Las páginas se enlazan con rutas relativas, así que funciona igual si el repo se llama como sea
  (`usuario.github.io/repo/`).
- Las entradas se guardan en la colección `entradas` con: `titulo`, `contenido`, `autor`, `autorEmail`,
  `fecha` (timestamp del servidor) e `imagenURL`.
- El contenido se escapa como HTML al renderizar (protección básica contra inyección de scripts).
- El SDK de Firebase se carga por CDN (versión compat, sin build). Si quieres actualizarlo, cambia
  `10.12.2` por la versión más reciente en los 3 archivos HTML.
