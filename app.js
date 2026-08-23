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
let currentUser = null;  // usuario actual (se actualiza en onAuthStateChanged)

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
// La primera vez que dispara confirma si hay sesión o no;
// necesitamos saberlo antes de actuar (evita redirect
// incorrecto a login.html cuando Firebase aún está cargando).
let authListo = false;
firebase.auth().onAuthStateChanged((user) => {
  currentUser = user;  // guardar referencia global del usuario
  actualizarInterfazSesion(user);

  // Según la página en la que estemos, arrancamos su lógica:
  if ($('#form-login')) {            // → login.html
    initLogin(user);
  } else if ($('#form-publicar')) {  // → crear.html
    initCrear(user);
  } else if ($('#lista-entradas')) { // → index.html
    initIndex(user);
  }

  // Marcar que la primera verificación de sesión ya terminó
  if (!authListo) authListo = true;
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

let crearInicializado = false; // evita agregar listeners múltiples veces
let editandoDocId = null; // ID del documento en modo edición (null = crear nuevo)

function initCrear(user) {
  // Modo vista previa: al abrir crear.html?preview=1 se muestra el
  // formulario sin sesión (útil para ver el diseño). No se puede
  // publicar de verdad, porque Firestore rechaza escrituras sin sesión.
  const params = new URLSearchParams(location.search);
  const modoPreview = params.has('preview');
  editandoDocId = params.get('edit') || null; // modo edición

  // Página protegida: sin sesión activa → redirigir al login.
  // Solo redirigimos DESPUÉS de que authListo es true (ya sabemos
  // si hay sesión de verdad, no es un falso negativo de carga).
  if (!user && !modoPreview && authListo) {
    location.replace('login.html');
    return;
  }

  // Si ya inicializamos antes, no volvemos a agregar listeners
  if (crearInicializado) return;
  crearInicializado = true;

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

  // Si es modo edición, cargar los datos del documento
  if (editandoDocId) {
    cargarEntradaParaEditar(editandoDocId);
  }

  // Enviar la entrada
  const form = $('#form-publicar');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    publicarEntrada(user);
  });
}

// Carga una entrada existente en el formulario para editarla
async function cargarEntradaParaEditar(docId) {
  const boton = $('#form-publicar').querySelector('button[type="submit"]');
  
  try {
    const doc = await db.collection('entradas').doc(docId).get();
    if (!doc.exists) {
      alert('This post does not exist.');
      location.href = 'index.html';
      return;
    }

    const datos = doc.data();

    // Verificar que el usuario actual sea el autor
    if (currentUser && currentUser.email !== datos.autorEmail) {
      alert('You can only edit your own posts.');
      location.href = 'index.html';
      return;
    }

    // Llenar el formulario con los datos existentes
    $('#titulo').value = datos.titulo || '';
    $('#imagen').value = datos.imagenURL || '';
    $('#video').value = datos.videoURL || '';

    // Poner el contenido en el editor Quill
    if (editorContenido && datos.contenidoHTML) {
      editorContenido.root.innerHTML = datos.contenidoHTML;
    }

    // Mostrar preview de imagen si hay URL
    if (datos.imagenURL) {
      const preview = $('#preview-imagen');
      preview.src = datos.imagenURL;
      preview.hidden = false;
    }

    // Cambiar título y botón para indicar modo edición
    const tituloPagina = document.querySelector('.encabezado-pagina h1');
    if (tituloPagina) tituloPagina.textContent = 'Edit post';
    if (boton) boton.textContent = '💾 Save changes';

  } catch (error) {
    console.error('Error loading post:', error);
    alert('Could not load the post. Try again.');
    location.href = 'index.html';
  }
}

// Guarda la entrada en Firestore (crear nueva o actualizar existente)
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
  const esEdicion = !!editandoDocId;
  boton.disabled = true;
  boton.textContent = esEdicion ? 'Saving…' : 'Publishing…';

  try {
    const datos = {
      titulo: titulo,
      contenido: contenido,           // texto plano (respaldo / búsqueda)
      contenidoHTML: contenidoHTML,   // texto con formato (negritas, listas…)
      autor: nombreDesdeEmail(user.email), // nombre visible (ej. "Juan Perez")
      autorEmail: user.email,
      imagenURL: imagenURL,
      videoURL: videoURL
    };

    if (esEdicion) {
      // Actualizar documento existente (mantener la fecha original)
      await db.collection('entradas').doc(editandoDocId).update(datos);
    } else {
      // Crear documento nuevo
      datos.fecha = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('entradas').add(datos);
    }

    // Todo listo → volver al inicio
    location.href = 'index.html';
  } catch (error) {
    console.error('Error al publicar:', error);
    const detalle = error && error.message ? error.message : 'Unknown error';
    alert('Error: ' + detalle + '\n\nTip: if it says "permission" or "unauthenticated", log out and log in again.');
  } finally {
    // SIEMPRE restaurar el botón (sin importar si hubo éxito o error)
    boton.disabled = false;
    boton.textContent = esEdicion ? '💾 Save changes' : '🚀 Publish post';
  }
}

/* ============================================================
   6) PÁGINA: index.html (lectura de entradas)
   ============================================================ */

// ---------- Modal del artículo completo ----------

// Almacena el ID del documento actualmente abierto en el modal
let docIdActual = null;

// Muestra el artículo completo en el modal (al hacer clic en una tarjeta)
function abrirArticulo(d, docId) {
  const modal = $('#modal-articulo');
  if (!modal) return;

  docIdActual = docId;  // guardar ID para edit/delete

  const autor = d.autor || d.autorEmail || 'Anonymous';
  const contenido = $('#modal-articulo-contenido');
  
  // Botones de acción (solo visible si el usuario es el autor)
  let accionesHTML = '';
  if (currentUser && currentUser.email === d.autorEmail) {
    accionesHTML = `
      <div class="articulo-acciones">
        <button type="button" class="boton boton-secundario" id="btn-editar" title="Edit this post">✏️ Edit</button>
        <button type="button" class="boton boton-peligro" id="btn-eliminar" title="Delete this post">🗑️ Delete</button>
      </div>
    `;
  }

  contenido.innerHTML = `
    <h2 class="articulo-titulo">${escapeHtml(d.titulo)}</h2>
    <div class="tarjeta-meta">
      <span class="avatar" aria-hidden="true">${escapeHtml(inicial(autor))}</span>
      <span class="tarjeta-autor">${escapeHtml(autor)}</span>
      <span class="tarjeta-separador" aria-hidden="true">·</span>
      <time>${escapeHtml(formatearFecha(d.fecha))}</time>
    </div>
    ${accionesHTML}
    ${d.imagenURL
      ? `<img class="articulo-imagen" src="${escapeHtml(d.imagenURL)}" alt="Image of: ${escapeHtml(d.titulo)}">`
      : ''}
    ${obtenerIdYouTube(d.videoURL)
      ? `<div class="articulo-video"><iframe src="https://www.youtube.com/embed/${obtenerIdYouTube(d.videoURL)}" title="Video of: ${escapeHtml(d.titulo)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      : ''}
    <div class="ql-editor articulo-contenido">${d.contenidoHTML || escapeHtml(d.contenido || '')}</div>
  `;

  // Conectar botones de acción
  if (accionesHTML) {
    const btnEditar = $('#btn-editar');
    const btnEliminar = $('#btn-eliminar');
    if (btnEditar) {
      btnEditar.addEventListener('click', () => {
        cerrarArticulo();
        location.href = `crear.html?edit=${docId}`;
      });
    }
    if (btnEliminar) {
      btnEliminar.addEventListener('click', () => eliminarEntrada(docId, d.titulo));
    }
  }

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

// Elimina una entrada de Firestore tras confirmar
async function eliminarEntrada(docId, titulo) {
  const confirmar = confirm(`Are you sure you want to delete "${titulo}"?\n\nThis action cannot be undone.`);
  if (!confirmar) return;

  try {
    await db.collection('entradas').doc(docId).delete();
    cerrarArticulo();
    // La lista se actualizará automáticamente por el onSnapshot en tiempo real
  } catch (error) {
    console.error('Error al eliminar:', error);
    alert('Could not delete the post. Make sure you are logged in and try again.');
  }
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
    abrirArticulo(d, doc.id);  // pasar el ID del documento
  });

  return tarjeta;
}
