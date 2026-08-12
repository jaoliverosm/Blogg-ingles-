/* ============================================================
   firebase-config.js — Configuración de Firebase
   ------------------------------------------------------------
   Credenciales del proyecto "BLOG-INGLES" (blog-ingles-947b8).
   Si algún día cambias de proyecto, reemplaza solo los valores.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBh7OhTi-3fuS2t-Tb8WEN-RSaEIQxfkrA",
  authDomain: "blog-ingles-947b8.firebaseapp.com",
  projectId: "blog-ingles-947b8",
  storageBucket: "blog-ingles-947b8.firebasestorage.app",
  messagingSenderId: "911407579461",
  appId: "1:911407579461:web:826e749f12c32ad9a37e2c"
};

// Inicializa Firebase (la condición evita errores si el script
// llegara a cargarse dos veces por accidente).
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
