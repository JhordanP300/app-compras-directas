// ═══════════════════════════════════════════════════════════════
// app.js — Lógica principal de StoreDesk v2.0
// ═══════════════════════════════════════════════════════════════

import {
  login,
  logout,
  onAuthChange,
  guardarRegistroCloud,
  eliminarRegistroCloud,
  escucharRegistros,
  obtenerTodosCloud,
  filtrarPorRango,
  encolarOffline,
  sincronizarQueue,
  contarQueue
} from "./firebase.js";

// ═══════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════
let registros       = [];       // Array en memoria con datos de Firestore
let unsubListen     = null;     // Función para cancelar listener de Firestore
let currentStep     = 1;
let sigCtx          = null;
let sigDrawing      = false;
let html5Qr         = null;
let scannerRunning  = false;
let scanTarget      = "oc";
let onlineStatus    = navigator.onLine;

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  // Fecha de hoy en formulario
  document.getElementById("fFechaLlegada").value = new Date().toISOString().split("T")[0];

  // Escuchar cambios de auth
  onAuthChange(handleAuthChange);

  // Eventos de conectividad
  window.addEventListener("online",  handleOnline);
  window.addEventListener("offline", handleOffline);
  updateConnStatus();

  // Cerrar modales al hacer clic en overlay
  document.getElementById("scannerModal").addEventListener("click", e => {
    if (e.target === document.getElementById("scannerModal")) closeScanner();
  });
  document.getElementById("detalleModal").addEventListener("click", e => {
    if (e.target === document.getElementById("detalleModal")) closeDetalle();
  });
  document.getElementById("loginModal").addEventListener("click", e => {
    // El login modal no se cierra haciendo clic afuera (es obligatorio)
  });

  // Enter en login
  document.getElementById("loginPassword").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("loginEmail").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
});

// ═══════════════════════════════════════════════════════════════
// CONECTIVIDAD
// ═══════════════════════════════════════════════════════════════
async function handleOnline() {
  onlineStatus = true;
  updateConnStatus();
  const count = contarQueue();
  if (count > 0) {
    const synced = await sincronizarQueue();
    if (synced > 0) toast(`✅ ${synced} registro(s) sincronizados desde modo offline`, "success");
  }
}

function handleOffline() {
  onlineStatus = false;
  updateConnStatus();
  toast("⚡ Sin conexión — los registros se guardarán localmente", "info");
}

function updateConnStatus() {
  const dot  = document.getElementById("connDot");
  const text = document.getElementById("connText");
  if (!dot || !text) return;
  if (onlineStatus) {
    dot.style.background = "var(--accent3)";
    text.textContent = "En línea";
  } else {
    dot.style.background = "var(--warn)";
    text.textContent = "Sin conexión";
  }
  const queueCount = contarQueue();
  const queueEl = document.getElementById("queueBadge");
  if (queueEl) {
    queueEl.style.display = queueCount > 0 ? "inline-flex" : "none";
    queueEl.textContent = `${queueCount} pendiente(s)`;
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════
function handleAuthChange(user) {
  if (user) {
    // Usuario autenticado
    document.getElementById("loginModal").classList.remove("open");
    document.getElementById("userEmail").textContent = user.email;
    document.getElementById("userInitials").textContent = user.email.slice(0,2).toUpperCase();
    startListening();
    updateDashboard();
    updateBadge();
    updateConnStatus();
  } else {
    // No autenticado → mostrar login
    stopListening();
    document.getElementById("loginModal").classList.add("open");
    document.getElementById("loginError").style.display = "none";
  }
}

window.doLogin = async function() {
  const email    = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btnLogin = document.getElementById("btnLogin");
  const errEl    = document.getElementById("loginError");

  if (!email || !password) {
    errEl.textContent = "Completa todos los campos";
    errEl.style.display = "block";
    return;
  }
  btnLogin.disabled = true;
  btnLogin.textContent = "Ingresando...";
  errEl.style.display = "none";

  try {
    await login(email, password);
    // onAuthChange se dispara automáticamente
  } catch (err) {
    errEl.textContent = traducirErrorAuth(err.code);
    errEl.style.display = "block";
    btnLogin.disabled = false;
    btnLogin.textContent = "Iniciar Sesión";
  }
};

window.doLogout = async function() {
  if (!confirm("¿Cerrar sesión?")) return;
  stopListening();
  await logout();
};

function traducirErrorAuth(code) {
  const msgs = {
    "auth/invalid-email":        "Correo inválido",
    "auth/user-not-found":       "Usuario no encontrado",
    "auth/wrong-password":       "Contraseña incorrecta",
    "auth/invalid-credential":   "Credenciales incorrectas",
    "auth/too-many-requests":    "Demasiados intentos. Espera un momento.",
    "auth/network-request-failed": "Sin conexión a internet",
  };
  return msgs[code] || `Error: ${code}`;
}

// ═══════════════════════════════════════════════════════════════
// LISTENER FIRESTORE EN TIEMPO REAL
// ═══════════════════════════════════════════════════════════════
function startListening() {
  if (unsubListen) return;
  unsubListen = escucharRegistros((data) => {
    registros = data;
    updateBadge();
    // Refrescar la vista activa
    const activePage = document.querySelector(".page.active");
    if (activePage?.id === "page-dashboard") updateDashboard();
    if (activePage?.id === "page-historial") renderHistorial();
  });
}

function stopListening() {
  if (unsubListen) { unsubListen(); unsubListen = null; }
  registros = [];
}

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
window.goTo = function(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("page-" + page).classList.add("active");
  const pages = ["dashboard","registro","historial","reportes"];
  document.querySelectorAll(".nav-item")[pages.indexOf(page)]?.classList.add("active");
  if (page === "dashboard") updateDashboard();
  if (page === "historial") renderHistorial();
  if (window.innerWidth < 900) document.getElementById("sidebar").classList.remove("open");
};

window.toggleSidebar = function() {
  document.getElementById("sidebar").classList.toggle("open");
};

// ═══════════════════════════════════════════════════════════════
// FORMULARIO — PASOS
// ═══════════════════════════════════════════════════════════════
window.nextStep = function(n) {
  if (n === 2 && !validateStep1()) return;
  if (n === 3 && !validateStep2()) return;
  currentStep = n;
  document.getElementById("formStep1").classList.toggle("hidden", n !== 1);
  document.getElementById("formStep2").classList.toggle("hidden", n !== 2);
  document.getElementById("formStep3").classList.toggle("hidden", n !== 3);

  [1,2,3].forEach(i => {
    const el = document.getElementById("step"+i);
    el.classList.remove("active","done");
    if (i < n) el.classList.add("done");
    if (i === n) el.classList.add("active");
  });

  if (n === 3) {
    initSig();
    const now = new Date();
    document.getElementById("fHoraEntrega").value =
      now.getHours().toString().padStart(2,"0") + ":" +
      now.getMinutes().toString().padStart(2,"0");
  }
};

function validateStep1() {
  const v = id => document.getElementById(id).value.trim();
  if (!v("fOC"))          { toast("Ingresa la Orden de Compra (OC)", "error"); return false; }
  if (!v("fCC"))          { toast("Ingresa el Centro de Costos (CC)", "error"); return false; }
  if (!v("fDescripcion")) { toast("Ingresa la descripción del artículo", "error"); return false; }
  return true;
}

function validateStep2() {
  const v = id => document.getElementById(id).value.trim();
  if (!v("fNombre")) { toast("Ingresa el nombre del receptor", "error"); return false; }
  if (!v("fCedula")) { toast("Ingresa la cédula del receptor", "error"); return false; }
  if (!document.getElementById("fArea").value) { toast("Selecciona el área", "error"); return false; }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// GUARDAR REGISTRO
// ═══════════════════════════════════════════════════════════════
window.guardarRegistro = async function() {
  const v = id => document.getElementById(id).value.trim();
  if (!v("fResponsable")) { toast("Ingresa el nombre del responsable del almacén", "error"); return; }

  const now = new Date();
  const registro = {
    oc:            v("fOC"),
    mnt:           v("fMNT"),
    cc:            v("fCC"),
    proveedor:     v("fProveedor"),
    descripcion:   v("fDescripcion"),
    cantidad:      v("fCantidad") || "1",
    guia:          v("fGuia"),
    fechaLlegada:  document.getElementById("fFechaLlegada").value,
    observaciones: v("fObservaciones"),
    nombre:        v("fNombre"),
    cedula:        v("fCedula"),
    area:          document.getElementById("fArea").value,
    cargo:         v("fCargo"),
    tel:           v("fTel"),
    email:         v("fEmail"),
    estado:        document.getElementById("fEstado").value,
    horaEntrega:   document.getElementById("fHoraEntrega").value,
    responsable:   v("fResponsable"),
    firma:         getSigData(),
    fechaDisplay:  now.toLocaleDateString("es-CO", {day:"2-digit",month:"2-digit",year:"numeric"}),
    fechaRegistro: now.toISOString(),
  };

  const btn = document.querySelector("#formStep3 .btn-primary");
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    if (onlineStatus) {
      await guardarRegistroCloud(registro);
      toast("✅ Registro guardado en la nube", "success");
    } else {
      encolarOffline(registro);
      toast("📥 Sin conexión — guardado localmente", "info");
      updateConnStatus();
    }
    resetForm();
    goTo("historial");
  } catch (err) {
    console.error(err);
    // Si falla Firestore, guardar en cola offline
    encolarOffline(registro);
    toast("⚠️ Error de red — guardado en cola offline", "info");
    updateConnStatus();
    resetForm();
    goTo("historial");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Guardar Registro";
  }
};

function resetForm() {
  ["fOC","fMNT","fCC","fProveedor","fDescripcion","fCantidad","fGuia","fObservaciones",
   "fNombre","fCedula","fCargo","fTel","fEmail","fResponsable"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("fArea").value = "";
  document.getElementById("fEstado").value = "entregado";
  document.getElementById("fFechaLlegada").value = new Date().toISOString().split("T")[0];
  nextStep(1);
}

// ═══════════════════════════════════════════════════════════════
// FIRMA DIGITAL
// ═══════════════════════════════════════════════════════════════
function initSig() {
  const canvas = document.getElementById("sigCanvas");
  canvas.width = canvas.offsetWidth || 700;
  sigCtx = canvas.getContext("2d");
  sigCtx.fillStyle = "#1a2133";
  sigCtx.fillRect(0, 0, canvas.width, canvas.height);
  sigCtx.strokeStyle = "#00d4ff";
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };

  canvas.onmousedown = canvas.ontouchstart = (e) => {
    e.preventDefault();
    sigDrawing = true;
    const p = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
  };
  canvas.onmousemove = canvas.ontouchmove = (e) => {
    e.preventDefault();
    if (!sigDrawing) return;
    const p = getPos(e);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
  };
  canvas.onmouseup = canvas.ontouchend = () => { sigDrawing = false; };
}

window.clearSig = function() {
  const canvas = document.getElementById("sigCanvas");
  sigCtx.fillStyle = "#1a2133";
  sigCtx.fillRect(0, 0, canvas.width, canvas.height);
};

function getSigData() {
  return document.getElementById("sigCanvas").toDataURL("image/png");
}

// ═══════════════════════════════════════════════════════════════
// ESCÁNER QR / CÓDIGO DE BARRAS
// ═══════════════════════════════════════════════════════════════
window.openScanner = function(target) {
  scanTarget = target;
  document.getElementById("scanResult").style.display = "none";
  document.getElementById("scannerModal").classList.add("open");
  switchScanMode("cam");
};

window.closeScanner = function() {
  document.getElementById("scannerModal").classList.remove("open");
  stopQr();
};

window.switchScanMode = function(mode) {
  document.getElementById("tabCam").classList.toggle("active", mode === "cam");
  document.getElementById("tabManual").classList.toggle("active", mode === "manual");
  document.getElementById("scanCamView").classList.toggle("hidden", mode !== "cam");
  document.getElementById("scanManualView").classList.toggle("hidden", mode !== "manual");
  if (mode === "cam") startQr();
  else stopQr();
};

function startQr() {
  if (scannerRunning) return;
  html5Qr = new Html5Qrcode("qr-reader");
  Html5Qrcode.getCameras()
    .then(cameras => {
      if (!cameras.length) { toast("No se encontró cámara", "error"); return; }
      const cam = cameras[cameras.length - 1];
      html5Qr.start(cam.id, { fps: 10, qrbox: 220 }, onScanSuccess, () => {})
        .then(() => { scannerRunning = true; })
        .catch(() => toast("No se pudo acceder a la cámara. Usa ingreso manual.", "error"));
    })
    .catch(() => toast("Error al acceder a la cámara. Usa ingreso manual.", "error"));
}

function stopQr() {
  if (html5Qr && scannerRunning) {
    html5Qr.stop().catch(() => {});
    scannerRunning = false;
  }
}

function onScanSuccess(text) {
  document.getElementById("scanValue").textContent = text;
  document.getElementById("scanResult").style.display = "block";
  applyScannedValue(text);
  stopQr();
  setTimeout(closeScanner, 1500);
}

function applyScannedValue(text) {
  const t = text.trim();
  if (/OC[-\s]?\d+/i.test(t))  { document.getElementById("fOC").value  = t; return; }
  if (/MNT[-\s]?\d+/i.test(t)) { document.getElementById("fMNT").value = t; return; }
  if (/CC[-\s]?\d+/i.test(t))  { document.getElementById("fCC").value  = t; return; }

  if (t.includes("|") || t.includes(";")) {
    t.split(/[|;]/).forEach(p => {
      const [k, v] = p.split(":");
      if (!k || !v) return;
      const key = k.trim().toUpperCase();
      if      (key === "OC")   document.getElementById("fOC").value          = v.trim();
      else if (key === "MNT")  document.getElementById("fMNT").value         = v.trim();
      else if (key === "CC")   document.getElementById("fCC").value          = v.trim();
      else if (key === "PROV") document.getElementById("fProveedor").value   = v.trim();
      else if (key === "DESC") document.getElementById("fDescripcion").value = v.trim();
    });
    return;
  }

  const fieldMap = { oc: "fOC", mnt: "fMNT", cc: "fCC" };
  document.getElementById(fieldMap[scanTarget] || "fOC").value = t;
}

window.applyManualCode = function() {
  const val = document.getElementById("manualCode").value.trim();
  if (!val) { toast("Ingresa un código", "error"); return; }
  applyScannedValue(val);
  document.getElementById("manualCode").value = "";
  closeScanner();
  toast("Código aplicado", "success");
};

// ═══════════════════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════════════════
window.renderHistorial = function() {
  const search = document.getElementById("searchInput").value.toLowerCase();
  const estado = document.getElementById("filterEstado").value;
  const area   = document.getElementById("filterArea").value;
  const fecha  = document.getElementById("filterFecha").value;

  const data = registros.filter(r => {
    if (search && !`${r.oc} ${r.mnt} ${r.cc} ${r.nombre} ${r.descripcion}`.toLowerCase().includes(search)) return false;
    if (estado && r.estado !== estado) return false;
    if (area   && r.area   !== area)   return false;
    if (fecha  && r.fechaLlegada !== fecha) return false;
    return true;
  });

  document.getElementById("filterCount").textContent = `${data.length} registro(s)`;

  const tbody = document.getElementById("histTableBody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No se encontraron registros</div></div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((r, i) => `
    <tr onclick="verDetalle('${r._docId}')">
      <td style="color:var(--text3);font-size:12px">${data.length - i}</td>
      <td class="td-oc">${r.oc}<div class="td-sub">${r.descripcion}</div></td>
      <td>${r.mnt || "—"}</td>
      <td>${r.cc}</td>
      <td>${r.nombre}<div class="td-sub">${r.cedula}</div></td>
      <td>${r.area}</td>
      <td>${r.fechaDisplay || r.fechaLlegada}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td onclick="event.stopPropagation()">
        <button class="btn btn-secondary btn-sm" onclick="verDetalle('${r._docId}')">👁</button>
        <button class="btn btn-danger btn-sm" onclick="eliminar('${r._docId}')">🗑</button>
      </td>
    </tr>
  `).join("");
};

window.eliminar = async function(docId) {
  if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
  try {
    await eliminarRegistroCloud(docId);
    toast("Registro eliminado", "info");
    // El listener actualizará la vista automáticamente
  } catch (err) {
    toast("Error al eliminar: " + err.message, "error");
  }
};

function estadoBadge(estado) {
  const map = {
    entregado: `<span class="badge badge-green">Entregado</span>`,
    pendiente: `<span class="badge badge-yellow">Pendiente</span>`,
    novedad:   `<span class="badge badge-red">Novedad</span>`,
  };
  return map[estado] || estado;
}

function updateBadge() {
  document.getElementById("histBadge").textContent = registros.length;
}

// ═══════════════════════════════════════════════════════════════
// DETALLE
// ═══════════════════════════════════════════════════════════════
window.verDetalle = function(docId) {
  const r = registros.find(x => x._docId === docId);
  if (!r) return;
  document.getElementById("detalleContent").innerHTML = `
    <div class="detail-grid" style="margin-bottom:16px">
      <div class="detail-field"><div class="detail-label">OC</div><div class="detail-val text-accent">${r.oc}</div></div>
      <div class="detail-field"><div class="detail-label">MNT</div><div class="detail-val">${r.mnt||"—"}</div></div>
      <div class="detail-field"><div class="detail-label">Centro de Costos</div><div class="detail-val">${r.cc}</div></div>
      <div class="detail-field"><div class="detail-label">Descripción</div><div class="detail-val">${r.descripcion}</div></div>
      <div class="detail-field"><div class="detail-label">Cantidad</div><div class="detail-val">${r.cantidad||"—"}</div></div>
      <div class="detail-field"><div class="detail-label">Proveedor</div><div class="detail-val">${r.proveedor||"—"}</div></div>
      <div class="detail-field"><div class="detail-label">Receptor</div><div class="detail-val">${r.nombre}</div></div>
      <div class="detail-field"><div class="detail-label">Cédula</div><div class="detail-val">${r.cedula}</div></div>
      <div class="detail-field"><div class="detail-label">Área</div><div class="detail-val">${r.area}</div></div>
      <div class="detail-field"><div class="detail-label">Estado</div><div class="detail-val">${estadoBadge(r.estado)}</div></div>
      <div class="detail-field"><div class="detail-label">Responsable</div><div class="detail-val">${r.responsable}</div></div>
      <div class="detail-field"><div class="detail-label">Fecha / Hora</div><div class="detail-val">${r.fechaDisplay} ${r.horaEntrega||""}</div></div>
    </div>
    ${r.observaciones ? `<div class="alert alert-info" style="margin-bottom:16px">📝 ${r.observaciones}</div>` : ""}
    <div>
      <div class="detail-label" style="margin-bottom:8px">FIRMA DEL RECEPTOR</div>
      <img src="${r.firma}" style="width:100%;border-radius:8px;border:1px solid var(--border)"/>
    </div>
  `;
  document.getElementById("detalleModal").classList.add("open");
};

window.closeDetalle = function() {
  document.getElementById("detalleModal").classList.remove("open");
};

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function updateDashboard() {
  const today = new Date().toLocaleDateString("es-CO", {day:"2-digit",month:"2-digit",year:"numeric"});
  const hoy   = registros.filter(r => r.fechaDisplay === today);

  document.getElementById("statHoy").textContent   = hoy.length;
  document.getElementById("statComp").textContent  = registros.filter(r => r.estado === "entregado").length;
  document.getElementById("statPend").textContent  = registros.filter(r => r.estado === "pendiente").length;
  document.getElementById("statTotal").textContent = registros.length;
  document.getElementById("dash-date").textContent = new Date().toLocaleDateString("es-CO",
    { weekday:"long", year:"numeric", month:"long", day:"numeric" });

  renderBarChart();
  drawDonut();
  renderRecentTable();
}

function renderBarChart() {
  const bars = document.getElementById("chartBars");
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d    = new Date(); d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("es-CO", { weekday:"short", day:"2-digit" });
    const disp  = d.toLocaleDateString("es-CO", { day:"2-digit", month:"2-digit", year:"numeric" });
    const count = registros.filter(r => r.fechaDisplay === disp).length;
    days.push({ label, count });
  }
  const maxVal = Math.max(...days.map(d => d.count), 1);
  bars.innerHTML = days.map(d => `
    <div class="bar-col">
      <div class="bar" data-val="${d.count}" style="height:${Math.max((d.count/maxVal)*160, 4)}px"></div>
      <div class="bar-label">${d.label}</div>
    </div>
  `).join("");
}

function drawDonut() {
  const canvas = document.getElementById("donutCanvas");
  const ctx    = canvas.getContext("2d");
  const entregado = registros.filter(r => r.estado === "entregado").length;
  const pendiente = registros.filter(r => r.estado === "pendiente").length;
  const novedad   = registros.filter(r => r.estado === "novedad").length;
  const total     = entregado + pendiente + novedad || 1;

  const segments = [
    { val: entregado, color: "#10b981", label: "Entregado" },
    { val: pendiente, color: "#f59e0b", label: "Pendiente" },
    { val: novedad,   color: "#ef4444", label: "Novedad"   },
  ];

  ctx.clearRect(0, 0, 130, 130);
  let start = -Math.PI / 2;
  segments.forEach(s => {
    if (!s.val) return;
    const angle = (s.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(65,65,52,start,start+angle);
    ctx.arc(65,65,32,start+angle,start,true);
    ctx.fillStyle = s.color;
    ctx.fill();
    start += angle;
  });

  ctx.beginPath(); ctx.arc(65,65,32,0,Math.PI*2);
  ctx.fillStyle = "#111620"; ctx.fill();
  ctx.fillStyle = "#e8edf5";
  ctx.font = "bold 16px Syne,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(total, 65, 70);

  document.getElementById("donutLegend").innerHTML = segments.map(s => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      ${s.label}
      <span class="legend-val">${s.val}</span>
    </div>
  `).join("");
}

function renderRecentTable() {
  const tbody   = document.getElementById("dashTableBody");
  const recents = registros.slice(0, 5);
  if (!recents.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="empty-icon">📭</div><div class="empty-text">No hay registros aún</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = recents.map(r => `
    <tr onclick="goTo('historial')" style="cursor:pointer">
      <td class="td-oc">${r.oc}</td>
      <td>${r.cc}</td>
      <td>${r.nombre}</td>
      <td>${r.area}</td>
      <td>${r.fechaDisplay}</td>
      <td>${estadoBadge(r.estado)}</td>
    </tr>
  `).join("");
}

// ═══════════════════════════════════════════════════════════════
// EXPORTAR
// ═══════════════════════════════════════════════════════════════
window.exportarExcel = async function() {
  let data = registros;
  if (!data.length) {
    try { data = await obtenerTodosCloud(); } catch(e) {}
  }
  if (!data.length) { toast("No hay registros para exportar", "info"); return; }

  const headers = ["OC","MNT","CC","Proveedor","Descripcion","Cantidad","Guia","FechaLlegada",
    "Nombre","Cedula","Area","Cargo","Telefono","Email","Estado","HoraEntrega","Responsable","Observaciones"];
  const rows = data.map(r => [r.oc,r.mnt,r.cc,r.proveedor,r.descripcion,r.cantidad,r.guia,
    r.fechaLlegada,r.nombre,r.cedula,r.area,r.cargo,r.tel,r.email,r.estado,r.horaEntrega,r.responsable,r.observaciones]);
  const csv = [headers,...rows].map(row =>
    row.map(v => `"${(v||"").toString().replace(/"/g,'""')}"`).join(",")
  ).join("\n");

  download("\uFEFF"+csv, `StoreDesk_${new Date().toISOString().slice(0,10)}.csv`, "text/csv;charset=utf-8");
  toast("✅ CSV descargado — ábrelo en Excel", "success");
};

window.exportarPDF = function() {
  if (!registros.length) { toast("No hay registros para exportar", "info"); return; }
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:"landscape", unit:"mm", format:"a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFillColor(17,22,32);
  doc.rect(0,0,pageW,22,"F");
  doc.setTextColor(0,212,255);
  doc.setFontSize(16); doc.setFont("helvetica","bold");
  doc.text("StoreDesk — Reporte de Compras Directas", 10, 14);
  doc.setFontSize(9); doc.setTextColor(180,190,210);
  doc.text(`Generado: ${new Date().toLocaleString("es-CO")}   Total: ${registros.length} registros`, pageW-10, 14, { align:"right" });

  let y = 30;
  const cols = ["OC","MNT","CC","Receptor","Cédula","Área","Descripción","Estado","Fecha","Responsable"];
  const widths = [30,22,25,35,25,25,40,22,22,28];
  const getVals = r => [r.oc,r.mnt||"—",r.cc,r.nombre,r.cedula,r.area,r.descripcion,r.estado,r.fechaDisplay,r.responsable];

  doc.setFillColor(26,33,51);
  doc.rect(8, y-5, pageW-16, 8, "F");
  doc.setTextColor(0,212,255); doc.setFontSize(7); doc.setFont("helvetica","bold");
  let x = 10;
  cols.forEach((c,i) => { doc.text(c, x, y); x += widths[i]; });
  y += 6;

  doc.setFont("helvetica","normal"); doc.setFontSize(7);
  registros.forEach((r, idx) => {
    if (y > 190) { doc.addPage(); y = 20; }
    doc.setFillColor(idx%2===0?17:20, idx%2===0?22:26, idx%2===0?32:38);
    doc.rect(8, y-4, pageW-16, 7, "F");
    doc.setTextColor(220,230,245);
    x = 10;
    getVals(r).forEach((v,i) => {
      doc.text(String(v||"—").substring(0, Math.floor(widths[i]/2.2)), x, y);
      x += widths[i];
    });
    y += 7;
  });

  doc.save(`StoreDesk_${new Date().toISOString().slice(0,10)}.pdf`);
  toast("✅ PDF generado y descargado", "success");
};

window.exportarRangoCSV = async function() {
  const desde = document.getElementById("rptDesde").value;
  const hasta = document.getElementById("rptHasta").value;
  const area  = document.getElementById("rptArea").value;

  let data;
  try {
    data = await filtrarPorRango(desde, hasta, area);
  } catch(e) {
    data = registros.filter(r => {
      if (desde && r.fechaLlegada < desde) return false;
      if (hasta && r.fechaLlegada > hasta) return false;
      if (area  && r.area !== area) return false;
      return true;
    });
  }

  if (!data.length) { toast("No hay registros en ese rango", "info"); return; }
  const headers = ["OC","MNT","CC","Nombre","Cedula","Area","Estado","FechaLlegada","HoraEntrega","Responsable","Observaciones"];
  const rows    = data.map(r => [r.oc,r.mnt,r.cc,r.nombre,r.cedula,r.area,r.estado,r.fechaLlegada,r.horaEntrega,r.responsable,r.observaciones]);
  const csv     = [headers,...rows].map(row =>
    row.map(v => `"${(v||"").toString().replace(/"/g,'""')}"`).join(",")
  ).join("\n");

  download("\uFEFF"+csv, `StoreDesk_${desde||"inicio"}_${hasta||"hoy"}.csv`, "text/csv;charset=utf-8");
  toast("✅ Reporte exportado", "success");
};

function download(content, filename, type) {
  const a = document.createElement("a");
  a.href  = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
window.toast = function(msg, type = "info") {
  const icons = { success:"✅", error:"❌", info:"ℹ️" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icons[type]} ${msg}`;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), 4000);
};
