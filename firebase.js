// ═══════════════════════════════════════════════════════════════
// firebase.js — StoreDesk v2.1 (sin autenticación)
// Solo Firestore — acceso directo sin login
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
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── ⚙️ CONFIGURACIÓN DE FIREBASE ────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyCkn9gkx0l3ZmZ1LZ4r73SUmdVPp7fl7BM",
  authDomain:        "compras-directas-9296d.firebaseapp.com",
  projectId:         "compras-directas-9296d",
  storageBucket:     "compras-directas-9296d.firebasestorage.app",
  messagingSenderId: "496654434159",
  appId:             "1:496654434159:web:9b99b108b203ae0b02729a"
};
// ─────────────────────────────────────────────────────────────

const app      = initializeApp(firebaseConfig);
const db       = getFirestore(app);
const COL_NAME = "compras_directas";

// ═══════════════════════════════════════════════════════════════
// CRUD — Registros
// ═══════════════════════════════════════════════════════════════

export async function guardarRegistroCloud(registro) {
  return addDoc(collection(db, COL_NAME), {
    ...registro,
    creadoEn: serverTimestamp(),
  });
}

export async function eliminarRegistroCloud(docId) {
  return deleteDoc(doc(db, COL_NAME, docId));
}

export async function obtenerTodosCloud() {
  const q    = query(collection(db, COL_NAME), orderBy("creadoEn", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

export function escucharRegistros(callback) {
  const q = query(collection(db, COL_NAME), orderBy("creadoEn", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ ...d.data(), _docId: d.id })));
  }, (err) => {
    console.error("Error Firestore:", err);
  });
}

export async function filtrarPorRango(desde, hasta, area) {
  let q = query(collection(db, COL_NAME), orderBy("fechaLlegada", "desc"));
  if (desde) q = query(q, where("fechaLlegada", ">=", desde));
  if (hasta) q = query(q, where("fechaLlegada", "<=", hasta));
  if (area)  q = query(q, where("area", "==", area));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
}

// ═══════════════════════════════════════════════════════════════
// OFFLINE QUEUE
// ═══════════════════════════════════════════════════════════════
const QUEUE_KEY = "storedesk_offline_queue";

export function encolarOffline(registro) {
  const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
  queue.push(registro);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

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

export function contarQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]").length;
}

// ═══════════════════════════════════════════════════════════════
// ⚠️  REGLAS FIRESTORE — pegar en Firebase Console
// ═══════════════════════════════════════════════════════════════
// Como ya no hay login, las reglas deben permitir acceso público.
// Ve a: Firestore → Reglas → pega esto → Publicar:
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /compras_directas/{docId} {
//       allow read, write: if true;
//     }
//   }
// }
