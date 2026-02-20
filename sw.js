// ═══════════════════════════════════════════════════════════════
// sw.js — Service Worker para PWA (modo offline)
// StoreDesk v2.0
// ═══════════════════════════════════════════════════════════════

const CACHE_NAME    = "storedesk-v2";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/firebase.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  // CDN libraries — se cachean al primer acceso
  "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
];

// ─── INSTALL: Pre-cachear assets estáticos ───────────────────
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando StoreDesk v2...");
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cachear uno a uno para no fallar si uno no está disponible
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch (e) {
          console.warn("[SW] No se pudo cachear:", url);
        }
      }
    })
  );
  self.skipWaiting(); // Activar inmediatamente sin esperar
});

// ─── ACTIVATE: Limpiar cachés viejas ─────────────────────────
self.addEventListener("activate", (event) => {
  console.log("[SW] Activado StoreDesk v2");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log("[SW] Eliminando caché vieja:", k);
          return caches.delete(k);
        })
      )
    )
  );
  self.clients.claim(); // Tomar control de las páginas abiertas
});

// ─── FETCH: Estrategia Network-First con fallback a caché ────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar peticiones de Firebase (Firestore, Auth)
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseapp.com") ||
    url.hostname.includes("identitytoolkit.google") ||
    url.pathname.includes("/__/") ||
    request.method !== "GET"
  ) {
    return; // Dejar pasar sin interceptar
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Si la respuesta es válida, guardarla en caché
        if (response && response.status === 200 && response.type !== "opaqueredirect") {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Sin red → servir desde caché
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // Si es navegación y no hay caché, mostrar index.html (SPA fallback)
          if (request.mode === "navigate") {
            return caches.match("./index.html");
          }
          return new Response("Sin conexión", { status: 503 });
        });
      })
  );
});

// ─── SYNC: Sincronizar cola offline cuando vuelva la conexión ─
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-queue") {
    console.log("[SW] Background sync: sincronizando cola offline...");
    // La sincronización real la maneja app.js con sincronizarQueue()
    // Este evento activa la lógica cuando el navegador detecta conexión
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: "SYNC_QUEUE" }));
      })
    );
  }
});

// ─── PUSH: Notificaciones push (preparado para uso futuro) ───
self.addEventListener("push", (event) => {
  const data = event.data?.json() || { title: "StoreDesk", body: "Tienes nuevas actualizaciones" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      vibrate: [200, 100, 200],
      data:  { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || "/"));
});
