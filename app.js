/* ============================================================
   app.js — Toda la lógica del blog
   ------------------------------------------------------------
   Este archivo se carga en las 3 páginas (index, login, crear).
   Cada página activa solo la parte que necesita: se detecta si
   el elemento correspondiente existe en el DOM.

   Orden de carga en el HTML:
     1) SDK de Firebase (CDN)
     2) firebase-config.js  (inicializa Firebase)
     3) app.js              (este archivo)
   ============================================================ */

/* ---------------- Atajos y referencias ---------------- */
const $ = (selector) => document.querySelector(selector);
const db = firebase.firestore();    // referencia a la base de datos Firestore

/* ============================================================
   1) TEMA CLARO / OSCURO
   ============================================================ */
function initTema() {
  const botonTema = $('#btn-tema');
  if (!botonTema) return;

  // Sincroniza el ícono con el tema ya aplicado en el <head>
  botonTema.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';

  botonTema.addEventListener('click', () => {
    const oscuro = document.documentElement.classList.toggle('dark');
    localStorage.setItem('tema', oscuro ? 'dark' : 'light');
    botonTema.textContent = oscuro ? '☀️' : '🌙';
  });
}
initTema();

/* ============================================================
   2) UTILIDADES
   ============================================================ */

// Escapa HTML para que el contenido de las entradas no pueda
// romper la página ni inyectar scripts (seguridad básica).
function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto == null ? '' : String(texto);
  return div.innerHTML;
}

// Convierte "juan.perez@correo.com" → "Juan Perez" (nombre visible)
function nombreDesdeEmail(email) {
  if (!email) return 'Anonymous';
  const local = email.split('@')[0];
  const nombre = local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return nombre || 'Anonymous';
}

// Primera letra del nombre, para el avatar circular
function inicial(nombre) {
  return (nombre || '?').trim().charAt(0).toUpperCase();
}

// Extrae el ID de un video de YouTube desde cualquier formato de URL
// (watch?v=..., youtu.be/..., embed/..., shorts/...).
function obtenerIdYouTube(url) {
  if (!url) return null;
  const match = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Formatea la fecha de Firestore a texto legible
function formatearFecha(fecha) {
  if (!fecha) return 'No date';
  try {
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return 'No date';
  }
}

// Traduce los errores de autenticación a mensajes entendibles
function mensajeErrorAuth(codigo) {
  const mensajes = {
    'auth/invalid-email': 'The email is not in a valid format.',
    'auth/user-not-found': 'There is no account with that email.',
    'auth/wrong-password': 'The password is incorrect.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/too-many-requests': 'Too many failed attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Connection error. Check your internet and try again.'
  };
  return mensajes[codigo] || 'Could not log in. Try again.';
}

/* ============================================================
   3) SESIÓN — comportamiento común a las 3 páginas
   ============================================================ */

// Se ejecuta cada vez que cambia el estado de sesión
// (al cargar la página y al iniciar/cerrar sesión).
firebase.auth().onAuthStateChanged((user) => {
  actualizarInterfazSesion(user);

  // Según la página en la que estemos, arrancamos su lógica:
  if ($('#form-login')) {            // → login.html
    initLogin(user);
  } else if ($('#form-publicar')) {  // → crear.html
    initCrear(user);
  } else if ($('#lista-entradas')) { // → index.html
    initIndex(user);
  }
});

// Muestra u oculta los botones del encabezado según la sesión
function actualizarInterfazSesion(user) {
  const btnLogout = $('#btn-logout');
  const btnNueva = $('#btn-nueva-entrada');
  if (btnLogout) btnLogout.style.display = user ? 'inline-flex' : 'none';
  if (btnNueva) btnNueva.style.display = user ? 'inline-flex' : 'none';

  // Botón principal de la portada (index.html)
  const cta = $('#cta-publicar');
  if (cta) {
    cta.innerHTML = user
      ? '<a class="boton boton-primario" href="crear.html">✏️ Write a post</a>'
      : '<a class="boton boton-primario" href="login.html">Log in to publish</a>';
  }
}

// Botón "Cerrar sesión" (visible solo con sesión activa)
const btnLogout = $('#btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await firebase.auth().signOut();
    location.href = 'index.html';
  });
}

/* ============================================================
   4) PÁGINA: login.html
   ============================================================ */
function initLogin(user) {
  // Si ya hay sesión iniciada, no tiene sentido ver el login
  if (user) {
    location.replace('index.html');
    return;
  }

  const form = $('#form-login');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = $('#email').value.trim();
    const contrasena = $('#password').value;
    const boton = form.querySelector('button[type="submit"]');
    const error = $('#error-login');

    // Validación rápida en el navegador
    if (!email || !contrasena) {
      error.textContent = 'Enter your email and password.';
      error.hidden = false;
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Signing in…';
    error.hidden = true;

    try {
      await firebase.auth().signInWithEmailAndPassword(email, contrasena);
      // Al iniciar sesión, onAuthStateChanged nos redirige a index.html
    } catch (err) {
      error.textContent = mensajeErrorAuth(err.code);
      error.hidden = false;
      boton.disabled = false;
      boton.textContent = 'Log in';
    }
  });
}

/* ============================================================
   5) PÁGINA: crear.html (protegida)
   ============================================================ */

// Instancia del editor de texto enriquecido (Quill). Se crea una
// sola vez, cuando la página de creación está visible.
let editorContenido = null;

// Barra de herramientas del editor (estilo procesador de texto)
const OPCIONES_EDITOR = {
  theme: 'snow',
  placeholder: 'Write your post here… You can add images in the text with the image button 🖼',
  modules: {
    // container = botones de la barra; handlers = comportamiento personalizado
    toolbar: {
      container: [
        [{ header: [2, 3, false] }],        // títulos y texto normal
        [{ size: ['small', false, 'large', 'huge'] }], // tamaño de letra
        ['bold', 'italic', 'underline', 'strike'], // formato de texto
        [{ color: [] }, { background: [] }], // color de letra y resaltado
        [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }], // listas (incluye checkboxes)
        [{ indent: '-1' }, { indent: '+1' }], // sangría
        [{ align: [] }],                     // alineación
        ['blockquote', 'link', 'code-block'], // cita, enlace y código
        ['image', 'clean']                   // imagen en el texto + quitar formato
      ],
      handlers: {
        // El botón de imagen pide una URL y la inserta justo donde
        // está el cursor, dentro del texto (sin subir archivos a ningún lado).
        image: function () {
          const url = prompt('Paste the image or GIF URL:');
          if (!url || !url.trim()) return;
          const indice = this.quill.getSelection(true).index;
          this.quill.insertEmbed(indice, 'image', url.trim(), 'user');
          this.quill.insertText(indice + 1, '\n', 'user');
        }
      }
    }
  }
};

function initCrear(user) {
  // Modo vista previa: al abrir crear.html?preview=1 se muestra el
  // formulario sin sesión (útil para ver el diseño). No se puede
  // publicar de verdad, porque Firestore rechaza escrituras sin sesión.
  const modoPreview = new URLSearchParams(location.search).has('preview');

  // Página protegida: sin sesión activa → redirigir al login
  if (!user && !modoPreview) {
    location.replace('login.html');
    return;
  }

  // Mostrar el formulario (estaba oculto mientras se verificaba la sesión)
  const tarjeta = $('#tarjeta-crear');
  if (tarjeta) tarjeta.style.visibility = 'visible';

  // Indicar con qué cuenta se está publicando (o el modo vista previa)
  const infoSesion = $('#info-sesion');
  if (infoSesion) {
    infoSesion.textContent = user
      ? `Publishing as: ${user.email}`
      : 'Form preview — log in to actually publish.';
  }

  // Crear el editor de texto enriquecido (solo la primera vez)
  if (!editorContenido && $('#editor-contenido')) {
    editorContenido = new Quill('#editor-contenido', OPCIONES_EDITOR);
  }

  // Vista previa de la imagen al pegar una URL
  const inputImagen = $('#imagen');
  const preview = $('#preview-imagen');
  inputImagen.addEventListener('input', () => {
    const url = inputImagen.value.trim();
    if (!url) {
      preview.hidden = true;
      return;
    }
    preview.src = url;
    preview.hidden = false;
    preview.onerror = () => { preview.hidden = true; };
  });

  // Enviar la entrada
  const form = $('#form-publicar');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    publicarEntrada(user);
  });
}

// Guarda la entrada en Firestore (sin subir nada a Storage)
async function publicarEntrada(user) {
  // Sin sesión (modo vista previa) no se puede publicar
  if (!user) {
    alert('You are in preview mode. Log in to publish.');
    return;
  }

  const titulo = $('#titulo').value.trim();
  // Contenido del editor: HTML con el formato y texto plano (para validar)
  const contenidoHTML = editorContenido ? editorContenido.root.innerHTML.trim() : '';
  const contenido = editorContenido ? editorContenido.getText().trim() : '';
  const imagenURL = $('#imagen').value.trim() || null;
  const videoURL = $('#video').value.trim() || null;

  // Validaciones con mensajes claros
  if (titulo.length < 3) {
    alert('Write a title of at least 3 characters.');
    return;
  }
  if (contenido.length < 10) {
    alert('Write a content of at least 10 characters.');
    return;
  }

  const boton = $('#form-publicar').querySelector('button[type="submit"]');
  boton.disabled = true;
  boton.textContent = 'Publishing…';

  try {
    // Guardar la entrada en Firestore
    await db.collection('entradas').add({
      titulo: titulo,
      contenido: contenido,           // texto plano (respaldo / búsqueda)
      contenidoHTML: contenidoHTML,   // texto con formato (negritas, listas…)
      autor: nombreDesdeEmail(user.email), // nombre visible (ej. "Juan Perez")
      autorEmail: user.email,
      fecha: firebase.firestore.FieldValue.serverTimestamp(),
      imagenURL: imagenURL,
      videoURL: videoURL
    });

    // Todo listo → volver al inicio
    location.href = 'index.html';
  } catch (error) {
    console.error('Error al publicar:', error);
    alert('An error occurred while publishing your post. Check your connection and try again.');
    boton.disabled = false;
    boton.textContent = 'Publish post';
  }
}

/* ============================================================
   6) PÁGINA: index.html (lectura de entradas)
   ============================================================ */

// ---------- Modal del artículo completo ----------

// Muestra el artículo completo en el modal (al hacer clic en una tarjeta)
function abrirArticulo(d) {
  const modal = $('#modal-articulo');
  if (!modal) return;

  const autor = d.autor || d.autorEmail || 'Anonymous';
  const contenido = $('#modal-articulo-contenido');
  contenido.innerHTML = `
    <h2 class="articulo-titulo">${escapeHtml(d.titulo)}</h2>
    <div class="tarjeta-meta">
      <span class="avatar" aria-hidden="true">${escapeHtml(inicial(autor))}</span>
      <span class="tarjeta-autor">${escapeHtml(autor)}</span>
      <span class="tarjeta-separador" aria-hidden="true">·</span>
      <time>${escapeHtml(formatearFecha(d.fecha))}</time>
    </div>
    ${d.imagenURL
      ? `<img class="articulo-imagen" src="${escapeHtml(d.imagenURL)}" alt="Image of: ${escapeHtml(d.titulo)}">`
      : ''}
    ${obtenerIdYouTube(d.videoURL)
      ? `<div class="articulo-video"><iframe src="https://www.youtube.com/embed/${obtenerIdYouTube(d.videoURL)}" title="Video of: ${escapeHtml(d.titulo)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      : ''}
    <div class="ql-editor articulo-contenido">${d.contenidoHTML || escapeHtml(d.contenido || '')}</div>
  `;

  modal.hidden = false;
  document.body.style.overflow = 'hidden'; // bloquea el scroll de fondo
}

// Cierra el modal
function cerrarArticulo() {
  const modal = $('#modal-articulo');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = ''; // restaura el scroll
}

// Conecta los controles del modal (botón ✕, fondo y tecla Esc)
function initModalArticulo() {
  const modal = $('#modal-articulo');
  if (!modal) return;
  $('#modal-cerrar').addEventListener('click', cerrarArticulo);
  $('#modal-fondo').addEventListener('click', cerrarArticulo);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) cerrarArticulo();
  });
}

// ---------- Paginación de la lista ----------
// Muestra la entrada más reciente destacada, las demás en lista
// compacta, y un botón "Cargar más" para no mostrar todo de golpe.
const POR_PAGINA = 6;
let entradasCargadas = []; // documentos cargados (tienen .data())
let visibles = POR_PAGINA; // cuántas entradas se muestran ahora

function initIndex(user) {
  const lista = $('#lista-entradas');
  const estado = $('#estado-carga');
  const contador = $('#contador');
  const btnMas = $('#btn-mas');

  // Conecta el modal del artículo (botones, fondo, tecla Esc)
  initModalArticulo();

  // Botón "Cargar más entradas" → muestra el siguiente lote
  if (btnMas) {
    btnMas.addEventListener('click', () => {
      visibles += POR_PAGINA;
      pintarEntradas();
    });
  }

  // Pinta la lista según lo cargado hasta ahora
  function pintarEntradas() {
    lista.innerHTML = '';

    if (entradasCargadas.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'estado-vacio';
      vacio.textContent = 'No posts yet. Log in and publish the first one!';
      lista.appendChild(vacio);
      if (btnMas) btnMas.hidden = true;
      return;
    }

    const lote = entradasCargadas.slice(0, visibles);
    lote.forEach((doc, i) => {
      // La 1ª entrada se ve destacada a todo el ancho; las demás en lista compacta
      lista.appendChild(crearTarjeta(doc, i === 0 ? 'destacada' : 'compacta'));
    });

    // Ocultar el botón cuando ya no quedan más por mostrar
    if (btnMas) btnMas.hidden = visibles >= entradasCargadas.length;
  }

  // Recibe el listado completo y vuelve a la primera página
  function cargarEntradas(docs) {
    entradasCargadas = docs;
    visibles = POR_PAGINA;
    if (contador) {
      contador.hidden = false;
      contador.textContent = docs.length === 1
        ? '1 post published'
        : `${docs.length} posts published`;
    }
    pintarEntradas();
  }

  // Escucha en tiempo real: la lista se actualiza sola
  // cuando alguien publica una entrada nueva.
  db.collection('entradas')
    .orderBy('fecha', 'desc') // más recientes primero
    .onSnapshot(
      (snap) => {
        // Ocultar el mensaje de carga tras la primera respuesta
        if (estado) estado.hidden = true;
        cargarEntradas(snap.docs);
      },
      (error) => {
        console.error('Error al leer entradas:', error);
        if (estado) {
          estado.hidden = false;
          estado.textContent = 'Could not load posts. Reload the page and try again.';
        }
      }
    );
}

// HTML de la meta de una entrada (avatar + autor + fecha)
function metaHTML(d, autor) {
  return `
    <div class="tarjeta-meta">
      <span class="avatar" aria-hidden="true">${escapeHtml(inicial(autor))}</span>
      <span class="tarjeta-autor">${escapeHtml(autor)}</span>
      <span class="tarjeta-separador" aria-hidden="true">·</span>
      <time>${escapeHtml(formatearFecha(d.fecha))}</time>
    </div>
  `;
}

// HTML del video de YouTube embebido (o vacío si no hay)
function videoHTML(d) {
  const id = obtenerIdYouTube(d.videoURL);
  if (!id) return '';
  return `
    <div class="tarjeta-video"><iframe src="https://www.youtube.com/embed/${id}" title="Video de: ${escapeHtml(d.titulo)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
  `;
}

// Miniatura de la lista compacta: usa la imagen de la entrada, la
// miniatura del video de YouTube, o un marcador de color.
function miniaturaHTML(d) {
  if (d.imagenURL) {
    return `<img class="tarjeta-miniatura" src="${escapeHtml(d.imagenURL)}" alt="Thumbnail of: ${escapeHtml(d.titulo)}" loading="lazy">`;
  }
  const id = obtenerIdYouTube(d.videoURL);
  if (id) {
    return `<img class="tarjeta-miniatura" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="Video thumbnail of: ${escapeHtml(d.titulo)}" loading="lazy">`;
  }
  return `<div class="tarjeta-miniatura tarjeta-miniatura--vacia">📖</div>`;
}

// Construye la tarjeta de una entrada. El tipo cambia la presentación:
//   'destacada' → 1ª entrada, todo el ancho
//   'compacta'  → lista con miniatura a la izquierda
//   (ninguno)   → cuadrícula clásica
// Al hacer clic en cualquier tarjeta se abre el artículo completo.
function crearTarjeta(doc, tipo) {
  const d = doc.data();
  const autor = d.autor || d.autorEmail || 'Anonymous';
  const contenido = `<div class="ql-editor tarjeta-contenido">${d.contenidoHTML || escapeHtml(d.contenido || '')}</div>`;
  const leer = '<span class="tarjeta-leer">Read full article →</span>';

  const tarjeta = document.createElement('article');

  if (tipo === 'destacada') {
    tarjeta.className = 'tarjeta tarjeta-destacada';
    tarjeta.innerHTML = `
      <h2 class="tarjeta-titulo">${escapeHtml(d.titulo)}</h2>
      ${metaHTML(d, autor)}
      ${d.imagenURL ? `<img class="tarjeta-imagen" src="${escapeHtml(d.imagenURL)}" alt="Image of: ${escapeHtml(d.titulo)}" loading="lazy">` : ''}
      ${videoHTML(d)}
      ${contenido}
      ${leer}
    `;
  } else if (tipo === 'compacta') {
    tarjeta.className = 'tarjeta tarjeta-compacta';
    tarjeta.innerHTML = `
      ${miniaturaHTML(d)}
      <div class="tarjeta-cuerpo">
        <h2 class="tarjeta-titulo">${escapeHtml(d.titulo)}</h2>
        ${metaHTML(d, autor)}
        ${contenido}
        ${leer}
      </div>
    `;
  } else {
    tarjeta.className = 'tarjeta';
    tarjeta.innerHTML = `
      <h2 class="tarjeta-titulo">${escapeHtml(d.titulo)}</h2>
      ${metaHTML(d, autor)}
      ${d.imagenURL ? `<img class="tarjeta-imagen" src="${escapeHtml(d.imagenURL)}" alt="Image of: ${escapeHtml(d.titulo)}" loading="lazy">` : ''}
      ${videoHTML(d)}
      ${contenido}
      ${leer}
    `;
  }

  // Clic en la tarjeta → abre el artículo completo (los enlaces internos
  // del contenido no disparan el modal).
  tarjeta.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    abrirArticulo(d);
  });

  return tarjeta;
}
