# StoreDesk v2.0 — Guía de Configuración

## 📁 Estructura del Proyecto

```
storedesk/
├── index.html          ← App principal (solo HTML/estructura)
├── manifest.json       ← Configuración PWA
├── sw.js               ← Service Worker (modo offline)
├── css/
│   └── styles.css      ← Todos los estilos
├── js/
│   ├── firebase.js     ← Capa de datos: Firebase Auth + Firestore
│   └── app.js          ← Lógica de la aplicación
└── icons/
    ├── icon-192.png    ← Ícono PWA (192×192 px)
    └── icon-512.png    ← Ícono PWA (512×512 px)
```

---

## ⚙️ PASO 1 — Crear el proyecto en Firebase

1. Ve a **https://console.firebase.google.com**
2. Clic en **"Agregar proyecto"** → ponle nombre (ej: `storedesk-empresa`)
3. Desactiva Google Analytics (opcional) → Crear proyecto

---

## 🔐 PASO 2 — Configurar Authentication

1. En el menú izquierdo: **Build → Authentication**
2. Clic en **"Comenzar"**
3. Pestaña **"Sign-in method"** → habilitar **"Correo electrónico/contraseña"**
4. Pestaña **"Users"** → **"Add user"** → crea el usuario del almacenista

---

## 🗄️ PASO 3 — Crear Firestore Database

1. En el menú: **Build → Firestore Database**
2. Clic en **"Crear base de datos"**
3. Selecciona **"Modo de producción"** → elige región más cercana (ej: `us-central1`)
4. En la pestaña **"Reglas"**, pega esto y publica:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /compras_directas/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 🔑 PASO 4 — Obtener la configuración de Firebase

1. En Firebase Console → **⚙️ Configuración del proyecto** (ícono engranaje)
2. Scroll hasta **"Tus apps"** → clic en **"</>  Web"**
3. Registra la app (nombre: `storedesk-web`)
4. Copia el objeto `firebaseConfig` que aparece

---

## 📝 PASO 5 — Pegar tu configuración en el código

Abre `js/firebase.js` y reemplaza esta sección:

```javascript
const firebaseConfig = {
  apiKey:            "TU_API_KEY",           // ← reemplaza
  authDomain:        "TU_PROJECT.firebaseapp.com",
  projectId:         "TU_PROJECT_ID",
  storageBucket:     "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
};
```

---

## 🖼️ PASO 6 — Agregar los íconos

Crea o exporta dos imágenes PNG en la carpeta `icons/`:
- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

Puedes usar el logo de tu empresa. Herramientas gratuitas:
- **https://realfavicongenerator.net** → genera todos los tamaños
- **https://maskable.app** → para ícono "maskable" PWA

---

## 🚀 PASO 7 — Publicar la app (hosting)

### Opción A — Firebase Hosting (recomendado, gratis)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting        # selecciona tu proyecto, carpeta: .
firebase deploy
```
La app quedará en: `https://TU_PROJECT.web.app`

### Opción B — Netlify (arrastrar y soltar)
1. Ve a **https://app.netlify.com/drop**
2. Arrastra toda la carpeta `storedesk/`
3. Listo — Netlify te da una URL pública

### Opción C — Servidor propio
Copia todos los archivos a tu servidor web (Apache/Nginx).
**Importante:** Debe ser HTTPS para que funcione el Service Worker y la cámara.

---

## 📲 Instalar como App (PWA)

### En Android (Chrome):
- Abre la URL en Chrome
- Aparecerá un banner abajo: **"Instalar StoreDesk"**
- O: Menú ⋮ → **"Añadir a pantalla de inicio"**

### En iOS (Safari):
- Abre la URL en Safari
- Botón compartir → **"Añadir a pantalla de inicio"**

### En PC (Chrome/Edge):
- Ícono de instalación en la barra de direcciones (extremo derecho)

---

## 📡 Funcionamiento Offline

- Si no hay internet, los registros se guardan en una **cola local**
- Al recuperar la conexión, se sincronizan automáticamente con Firestore
- El indicador en el header muestra el estado de conexión en tiempo real

---

## 🔧 Personalización Rápida

| Qué cambiar | Dónde |
|-------------|-------|
| Nombre de la empresa | `index.html` → `.logo-mark` |
| Áreas del formulario | `index.html` → `<select id="fArea">` |
| Colores | `css/styles.css` → `:root { }` |
| Nombre colección BD | `js/firebase.js` → `COL_NAME` |
| Logo / íconos | `icons/` → reemplazar los PNG |

---

## 🛠️ Tecnologías Usadas

| Tecnología | Uso |
|-----------|-----|
| Firebase Auth | Login de usuarios |
| Firestore | Base de datos en la nube en tiempo real |
| Service Worker | Modo offline + caché |
| Web App Manifest | Instalación como PWA |
| html5-qrcode | Escáner QR y código de barras |
| jsPDF | Generación de reportes PDF |
| Vanilla JS (ES Modules) | Sin frameworks, sin dependencias pesadas |

---

## ❓ Soporte

Para crear más usuarios, ve a **Firebase Console → Authentication → Users → Add user**.

Cada registro en Firestore guarda quién lo creó (`creadoPor`) y el timestamp exacto (`creadoEn`).
