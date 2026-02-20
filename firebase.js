// ═══════════════════════════════════════════════════════════════
// firebase.js — Configuración y capa de datos con Firebase
// StoreDesk v2.0
//
// INSTRUCCIONES DE CONFIGURACIÓN:
// 1. Ve a https://console.firebase.google.com
// 2. Crea un nuevo proyecto (ej: "storedesk-empresa")
// 3. Agrega una app web y copia tu configuración aquí abajo
// 4. En Firestore Database → Crear base de datos → Modo producción
// 5. En Authentication → Iniciar sesión → Habilitar "Correo/contraseña"
// 6. Ajusta las reglas de Firestore (ver comentario al final)
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── ⚙️ REEMPLAZA CON TU CONFIGURACIÓN DE FIREBASE ───────────────
const firebaseConfig = {
  apiKey: "AIzaSyCkn9gkx0l3ZmZ1LZ4r73SUmdVPp7fl7BM",
  authDomain: "compras-directas.firebaseapp.com",
  projectId: "compras-directas",
  storageBucket: "compras-directas.firebasestorage.app",
  messagingSenderId: "496654434159",
  appId: "1:496654434159:web:9b99b108b203ae0b02729a"
};
// ──────────────────────────────────────────────────────────────────

// Inicializar Firebase
const app        = initializeApp(firebaseConfig);
const db         = getFirestore(app);
const auth       = getAuth(app);
const COL_NAME   = "compras_directas"; // Nombre de la colección en Firestore

// ═══════════════════════════════════════════════════════════════
// AUTH — Autenticación
// ═══════════════════════════════════════════════════════════════

/**
 * Iniciar sesión con email y contraseña
 * @param {string} email
 * @param {string} password
 * @returns {Promise<UserCredential>}
 */
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Cerrar sesión
 */
export async function logout() {
  return signOut(auth);
}

/**
 * Escuchar cambios de autenticación
 * @param {Function} callback - recibe user (objeto) o null
 */
export function onAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

/**
 * Obtener usuario actual
 */
export function currentUser() {
  return auth.currentUser;
}

// ═══════════════════════════════════════════════════════════════
// FIRESTORE — CRUD de registros
// ═══════════════════════════════════════════════════════════════

/**
 * Guardar nuevo registro en Firestore
 * @param {Object} registro - Objeto con todos los datos del formulario
 * @returns {Promise<DocumentReference>}
 */
export async function guardarRegistroCloud(registro) {
  const user = currentUser();
  const docData = {
    ...registro,
    creadoPor: user ? user.email : "anonimo",
    creadoEn: serverTimestamp(),
    // La firma (base64) puede ser grande; se guarda directamente en Firestore.
    // Para producción avanzada, considera subir la imagen a Firebase Storage
    // y guardar solo la URL aquí.
  };
  return addDoc(collection(db, COL_NAME), docData);
}

/**
 * Eliminar un registro por su ID de documento Firestore
 * @param {string} docId
 */
export async function eliminarRegistroCloud(docId) {
  return deleteDoc(doc(db, COL_NAME, docId));
}

/**
 * Obtener todos los registros una sola vez (útil para exportar)
 * @returns {Promise<Array>}
 */
export async function obtenerTodosCloud() {
  const q = query(collection(db, COL_NAME), orderBy("creadoEn", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

/**
 * Escucha en tiempo real la colección. Llama al callback cada vez
 * que haya un cambio en Firestore (insert, delete, update).
 * @param {Function} callback - recibe Array de registros
 * @returns {Function} unsubscribe — llámala para detener la escucha
 */
export function escucharRegistros(callback) {
  const q = query(collection(db, COL_NAME), orderBy("creadoEn", "desc"));
  const unsub = onSnapshot(q, (snap) => {
    const data = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    callback(data);
  }, (err) => {
    console.error("Error Firestore:", err);
  });
  return unsub; // Guarda esta función para cancelar cuando salgas
}

/**
 * Filtrar por rango de fechas (usando campo fechaLlegada string 'YYYY-MM-DD')
 * @param {string} desde - 'YYYY-MM-DD'
 * @param {string} hasta - 'YYYY-MM-DD'
 * @param {string} area  - filtra por área ('' = todas)
 * @returns {Promise<Array>}
 */
export async function filtrarPorRango(desde, hasta, area) {
  let q = query(
    collection(db, COL_NAME),
    orderBy("fechaLlegada", "desc")
  );
  if (desde) q = query(q, where("fechaLlegada", ">=", desde));
  if (hasta) q = query(q, where("fechaLlegada", "<=", hasta));
  if (area)  q = query(q, where("area", "==", area));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE QUEUE — Cola local cuando no hay internet
// ═══════════════════════════════════════════════════════════════
const QUEUE_KEY = "storedesk_offline_queue";

/**
 * Encolar registro para sincronizar cuando haya conexión
 * @param {Object} registro
 */
export function encolarOffline(registro) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push(registro);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Sincronizar cola offline con Firestore
 * Llamar al recuperar conexión (evento 'online')
 */
export async function sincronizarQueue() {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  if (!queue.length) return 0;
  let synced = 0;
  for (const registro of queue) {
    try {
      await guardarRegistroCloud(registro);
      synced++;
    } catch (e) {
      console.error("Error sincronizando:", e);
    }
  }
  localStorage.removeItem(QUEUE_KEY);
  return synced;
}

/**
 * Obtener cantidad de registros en cola offline
 */
export function contarQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]").length;
}

// ═══════════════════════════════════════════════════════════════
// REGLAS FIRESTORE RECOMENDADAS (pegar en Firebase Console):
// ═══════════════════════════════════════════════════════════════
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /compras_directas/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
*/
