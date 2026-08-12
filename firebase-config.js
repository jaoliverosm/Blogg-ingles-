/* ============================================================
   firebase-config.js — Configuración de Firebase
   ------------------------------------------------------------
   Reemplaza TODOS los valores de abajo con las credenciales de
   tu proyecto. Las encuentras en:
   Firebase Console → Configuración del proyecto (engranaje) →
   Tus apps → ícono Web (</>) → copia el objeto firebaseConfig.

   Este archivo se carga DESPUÉS del SDK de Firebase y ANTES
   de app.js. No cambies la estructura, solo los valores.
   ============================================================ */

const firebaseConfig = {
  apiKey: "PON_AQUI_TU_API_KEY",
  authDomain: "PON_AQUI_TU_PROYECTO.firebaseapp.com",
  projectId: "PON_AQUI_TU_PROYECTO",
  storageBucket: "PON_AQUI_TU_PROYECTO.appspot.com",
  messagingSenderId: "PON_AQUI_TU_MESSAGING_SENDER_ID",
  appId: "PON_AQUI_TU_APP_ID"
};

// Inicializa Firebase (la condición evita errores si el script
// llegara a cargarse dos veces por accidente).
if (!firebase.apps || !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
