const SHEET_ID     = window.APP_CONFIG?.SHEET_ID     || '';
const API_KEY      = window.APP_CONFIG?.API_KEY       || '';
const SCRIPT_URL   = window.APP_CONFIG?.SCRIPT_URL    || '';
const VENTAS_SHEET = 'Respuestas formulario';
const INV_SHEET    = 'Inventario';

let rows = [];
let nextId = 1;
let inventarioDB = [];
let currentUser = null;   // { usuario, rol }
let editProdCodigo = null;

// ── Helpers de red ──────────────────────────────────────────────
async function callScript(payload) {
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function fetchSheet(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data.values || [];
}

// ── LOGIN ────────────────────────────────────────────────────────
async function doLogin() {
  const usuario  = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value.trim();
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');
  if (!usuario || !password) { errEl.textContent = 'Ingresá usuario y contraseña.'; return; }
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const res = await callScript({ action: 'login', usuario, password });
    if (res.status === 'ok') {
      currentUser = { usuario: res.usuario, rol: res.rol };
      sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
      startApp();
    } else {
      errEl.textContent = res.message || 'Error al ingresar.';
    }
  } catch(e) {
    errEl.textContent = 'No se pudo conectar. Verificá tu conexión.';
  }
  btn.disabled = false; btn.textContent = 'Ingresar';
}

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem('currentUser');
  document.getElementById('app-screen').style.display   = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
}

function startApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'block';
  const isAdmin = currentUser.rol === 'admin';
  // Badge de usuario
  const badge = document.getElementById('user-badge');
  badge.textContent = currentUser.usuario;
  badge.className   = 'user-badge ' + (isAdmin ? 'badge-admin' : 'badge-vendedor');
  // Mostrar/ocultar solapas según rol
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
  // Responsable fijo según usuario logueado
  const fijoEl = document.getElementById('responsable-fijo');
  const respInput = document.getElementById('responsable');
  if (fijoEl && respInput) {
    const nombre = currentUser.usuario.toUpperCase();
    fijoEl.textContent = nombre;
    respInput.value = nombre;
  }
  // Inicializar
  addRow();
  preloadInventario();
  initFondo();
  renderGradientesGrid();
  if (isAdmin) loadUsuarios();
}

// ── Precarga inventario ──────────────────────────────────────────
async function preloadInventario() {
  try {
    const data  = await fetchSheet(INV_SHEET);
    const filas = data.slice(2);
    inventarioDB = filas.map(r => ({
      codigo: String(r[0] || '').trim(),
      desc:   String(r[1] || '').trim(),
      stock:  parseFloat(r[2] || 0),
      precio: parseFloat(r[3] || 0) || 100
    }));
  } catch(e) { console.warn('No se pudo precargar inventario:', e); }
}

// ── Navegación ────────────────────────────────────────────────────
function showTab(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'historial')  loadHistorial();
  if (tab === 'buscar')     { document.getElementById('buscar-nro').value=''; document.getElementById('resultado-ticket').style.display='none'; document.getElementById('error-buscar').style.display='none'; }
  if (tab === 'inventario') loadInventario();
  if (tab === 'resumen')    loadResumen();
  if (tab === 'config')     loadUsuarios();
  if (tab === 'auditoria')  loadAuditoria();
}

// ── Grilla ───────────────────────────────────────────────────────
function addRow() {
  const id = nextId++;
  rows.push({ id, codigo: '', desc: '', precio: '', cantidad: '' });
  renderGrid();
}
function removeRow(id) {
  if (rows.length <= 1) {
    rows[0] = { id: rows[0].id, codigo: '', desc: '', precio: '', cantidad: '' };
  } else {
    rows = rows.filter(r => r.id !== id);
  }
  renderGrid(); updateTotal();
}
function getRow(id) { return rows.find(r => r.id === id); }

function onCodigoInput(id) {
  const row  = getRow(id);
  row.codigo = document.getElementById('cod-' + id).value.trim();
  const prod = inventarioDB.find(p => p.codigo === row.codigo);
  if (prod) {
    row.desc   = prod.desc;
    row.precio = prod.precio;
    document.getElementById('desc-'   + id).value = prod.desc;
    document.getElementById('precio-' + id).value = prod.precio;
    setTimeout(() => document.getElementById('cant-' + id).focus(), 20);
  }
}
function onDescInput(id)   { getRow(id).desc   = document.getElementById('desc-'   + id).value; }
function onPrecioInput(id) { getRow(id).precio  = document.getElementById('precio-' + id).value; updateSubtotal(id); }
function onCantidadInput(id) {
  getRow(id).cantidad = document.getElementById('cant-' + id).value;
  updateSubtotal(id); updateTotal();
}
function onCantidadKey(id, e) {
  if (e.key === 'Enter' || e.key === 'Tab') {
    const row = getRow(id);
    if (row.codigo && row.cantidad && rows[rows.length - 1].id === id) {
      e.preventDefault(); addRow();
      setTimeout(() => document.getElementById('cod-' + rows[rows.length-1].id).focus(), 40);
    }
  }
}
function updateSubtotal(id) {
  const row = getRow(id);
  const sub = (parseFloat(row.precio)||0) * (parseFloat(row.cantidad)||0);
  const el  = document.getElementById('sub-' + id);
  if (el) el.textContent = sub > 0 ? '$' + sub.toLocaleString('es-AR') : '—';
  updateTotal();
}
function updateTotal() {
  const total = rows.reduce((s,r) => s + (parseFloat(r.precio)||0)*(parseFloat(r.cantidad)||0), 0);
  document.getElementById('total-valor').textContent = '$' + total.toLocaleString('es-AR');
}
function renderGrid() {
  const body = document.getElementById('grid-body');
  body.innerHTML = rows.map(row => {
    const isEmpty = !row.codigo && !row.desc && !row.precio && !row.cantidad;
    const isLast  = rows[rows.length - 1].id === row.id;
    const sub     = (parseFloat(row.precio)||0)*(parseFloat(row.cantidad)||0);
    return `<div class="grid-row ${isLast && isEmpty ? 'empty-row' : ''}">
      <div class="gcell"><input id="cod-${row.id}"    type="text"   value="${row.codigo}"   placeholder="Código"      oninput="onCodigoInput(${row.id})"></div>
      <div class="gcell"><input id="desc-${row.id}"   type="text"   value="${row.desc}"     placeholder="Descripción" oninput="onDescInput(${row.id})"></div>
      <div class="gcell"><input id="precio-${row.id}" type="number" value="${row.precio}"   placeholder="$"           oninput="onPrecioInput(${row.id})"></div>
      <div class="gcell"><input id="cant-${row.id}"   type="number" value="${row.cantidad}" placeholder="0"
        oninput="onCantidadInput(${row.id})" onkeydown="onCantidadKey(${row.id}, event)"></div>
      <div class="gcell-sub" id="sub-${row.id}">${sub > 0 ? '$' + sub.toLocaleString('es-AR') : '—'}</div>
      <div class="gcell"><button class="del-btn" onclick="removeRow(${row.id})" title="Quitar">×</button></div>
    </div>`;
  }).join('');
}

// ── Guardar venta ────────────────────────────────────────────────
async function guardarVenta() {
  const pago        = document.getElementById('pago').value;
  const turno       = document.getElementById('turno').value;
  const responsable = document.getElementById('responsable').value;
  const items       = rows.filter(r => r.codigo && r.precio && r.cantidad);
  if (!items.length || !pago || !turno || !responsable) {
    showError('Completá todos los campos y agregá al menos un producto.'); return;
  }
  const btn = document.getElementById('btn-guardar');
  btn.disabled = true; btn.textContent = 'Guardando...';
  hideMessages();
  const fecha   = new Date().toLocaleDateString('es-AR');
  const payload = items.map(item => ({
    fecha, codigo: item.codigo, descripcion: item.desc,
    precio: parseFloat(item.precio), cantidad: parseFloat(item.cantidad),
    subtotal: parseFloat(item.precio) * parseFloat(item.cantidad),
    formaPago: pago, turno, responsable
  }));
  try {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'addVentas', ventas: payload })
    });
    let nroTicket = '';
    try { const json = await res.json(); nroTicket = json.nroTicket || ''; } catch(e) {}
    showTicket(payload, pago, turno, responsable, nroTicket);
    rows = []; nextId = 1; addRow();
    ['pago','turno'].forEach(id => document.getElementById(id).value = '');
    // responsable se mantiene fijo al usuario logueado
    updateTotal();
    await preloadInventario();
  } catch(err) { showError('No se pudo conectar. Verificá tu conexión a internet.'); }
  btn.disabled = false; btn.textContent = 'Registrar venta';
}

// ── Historial ────────────────────────────────────────────────────
let historialData = [];

async function loadHistorial() {
  const loadEl  = document.getElementById('loading-historial');
  const wrapEl  = document.getElementById('wrap-historial');
  loadEl.style.display = 'block'; loadEl.textContent = 'Cargando...';
  wrapEl.style.display = 'none';
  try {
    const filas = await fetchSheet(VENTAS_SHEET);
    historialData = filas.slice(1).filter(r => r[0]).reverse();
    if (!historialData.length) { loadEl.textContent = 'Sin ventas registradas.'; return; }
    renderHistorial(historialData);
    loadEl.style.display = 'none'; wrapEl.style.display = 'block';
  } catch(e) { loadEl.textContent = 'Error al cargar. Verificá la configuración.'; }
}

function renderHistorial(data) {
  const tbodyEl = document.getElementById('tbody-historial');
  tbodyEl.innerHTML = data.map(r => {
    const subtotal = (parseFloat(r[3]||0)) * (parseFloat(r[4]||0));
    const nro = r[8] || '—';
    return `<tr>
      <td><span class="badge-ticket" onclick="irABuscar('${nro}')">${nro}</span></td>
      <td>${r[0]||''}</td>
      <td style="font-family:monospace;font-size:12px">${r[1]||''}</td>
      <td>${r[2]||''}</td>
      <td>$${parseFloat(r[3]||0).toLocaleString('es-AR')}</td>
      <td>${r[4]||''}</td>
      <td style="font-weight:600">$${subtotal.toLocaleString('es-AR')}</td>
      <td>${badgeTurno(r[6]||'')}</td>
      <td>${r[7]||''}</td>
      <td>${badgePago(r[5]||'')}</td>
    </tr>`;
  }).join('');
}

function filtrarHistorial() {
  const q = document.getElementById('historial-filter').value.toLowerCase().trim();
  if (!q) { renderHistorial(historialData); return; }
  const filtrado = historialData.filter(r =>
    String(r[8]||'').toLowerCase().includes(q) ||
    String(r[7]||'').toLowerCase().includes(q) ||
    String(r[2]||'').toLowerCase().includes(q) ||
    String(r[1]||'').toLowerCase().includes(q) ||
    String(r[0]||'').toLowerCase().includes(q)
  );
  renderHistorial(filtrado);
}

function irABuscar(nro) {
  const btnBuscar = document.getElementById('tab-btn-buscar');
  if (btnBuscar) { showTab('buscar', btnBuscar); }
  document.getElementById('buscar-nro').value = nro;
  buscarTicket();
}

// ── Inventario ───────────────────────────────────────────────────
async function loadInventario() {
  const loadEl  = document.getElementById('loading-inventario');
  const wrapEl  = document.getElementById('wrap-inventario');
  const tbodyEl = document.getElementById('tbody-inventario');
  loadEl.style.display = 'block'; loadEl.textContent = 'Cargando...';
  wrapEl.style.display = 'none';
  try {
    const filas = await fetchSheet(INV_SHEET);
    const data  = filas.slice(2);
    if (!data.length) { loadEl.textContent = 'Sin datos de inventario.'; return; }
    inventarioDB = data.map(r => ({
      codigo: String(r[0]||'').trim(), desc: String(r[1]||'').trim(),
      stock: parseFloat(r[2]||0), precio: parseFloat(r[3]||0) || 100
    }));
    const total_items = inventarioDB.length;
    const bajo  = inventarioDB.filter(p => p.stock <= 3).length;
    const medio = inventarioDB.filter(p => p.stock > 3 && p.stock <= 8).length;
    const ok    = inventarioDB.filter(p => p.stock > 8).length;
    const statsEl = document.getElementById('inv-stats');
    if (statsEl) statsEl.innerHTML = `
      <div class="inv-stat inv-stat-total"><div class="inv-stat-n">${total_items}</div><div class="inv-stat-l">productos</div></div>
      <div class="inv-stat inv-stat-ok"><div class="inv-stat-n">${ok}</div><div class="inv-stat-l">stock OK</div></div>
      <div class="inv-stat inv-stat-medio"><div class="inv-stat-n">${medio}</div><div class="inv-stat-l">stock medio</div></div>
      <div class="inv-stat inv-stat-bajo"><div class="inv-stat-n">${bajo}</div><div class="inv-stat-l">stock bajo</div></div>`;
    tbodyEl.innerHTML = inventarioDB.map(p => `
      <tr>
        <td style="font-family:monospace;font-size:12px">${p.codigo}</td>
        <td>${p.desc}</td>
        <td class="right" style="font-weight:600">${p.stock}</td>
        <td class="right">$${p.precio.toLocaleString('es-AR')}</td>
        <td class="center">${p.stock <= 3
          ? '<span class="badge b-low">STOCK BAJO</span>'
          : p.stock <= 8
            ? '<span class="badge b-cig">STOCK MEDIO</span>'
            : '<span class="badge b-ok">OK</span>'}</td>
        <td class="center">
          <button class="btn-edit-prod" onclick="openEditProd('${p.codigo}')">✏ Editar</button>
        </td>
      </tr>`).join('');
    loadEl.style.display = 'none'; wrapEl.style.display = 'block';
  } catch(e) { loadEl.textContent = 'Error al cargar inventario.'; }
}

// ── Editar producto ──────────────────────────────────────────────
function openEditProd(codigo) {
  const prod = inventarioDB.find(p => p.codigo === codigo);
  if (!prod) return;
  editProdCodigo = codigo;
  document.getElementById('edit-prod-nombre').textContent = prod.desc + ' (' + codigo + ')';
  document.getElementById('edit-stock').value  = prod.stock;
  document.getElementById('edit-precio').value = prod.precio;
  document.getElementById('edit-prod-error').textContent = '';
  document.getElementById('modal-edit-prod').classList.add('open');
}
function cerrarModalProd(e) {
  if (e && e.target !== document.getElementById('modal-edit-prod')) return;
  document.getElementById('modal-edit-prod').classList.remove('open');
}
async function guardarEditProd() {
  const stock  = parseFloat(document.getElementById('edit-stock').value);
  const precio = parseFloat(document.getElementById('edit-precio').value);
  const errEl  = document.getElementById('edit-prod-error');
  if (isNaN(stock) || isNaN(precio)) { errEl.textContent = 'Ingresá valores válidos.'; return; }
  const btn = document.getElementById('btn-save-prod');
  btn.disabled = true; btn.textContent = 'Guardando...';
  errEl.textContent = '';
  try {
    await callScript({ action: 'updateStock',  codigo: editProdCodigo, stock });
    await callScript({ action: 'updatePrecio', codigo: editProdCodigo, precio });
    document.getElementById('modal-edit-prod').classList.remove('open');
    await loadInventario();
    await preloadInventario();
  } catch(e) { errEl.textContent = 'Error al guardar. Intentá de nuevo.'; }
  btn.disabled = false; btn.textContent = 'Guardar cambios';
}

// ── Agregar producto ─────────────────────────────────────────────
function openAddProducto() {
  ['add-codigo','add-desc','add-stock','add-precio'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('add-prod-error').textContent = '';
  document.getElementById('modal-add-prod').classList.add('open');
}
function cerrarModalAddProd(e) {
  if (e && e.target !== document.getElementById('modal-add-prod')) return;
  document.getElementById('modal-add-prod').classList.remove('open');
}
async function guardarAddProd() {
  const codigo      = document.getElementById('add-codigo').value.trim();
  const descripcion = document.getElementById('add-desc').value.trim();
  const stock       = parseFloat(document.getElementById('add-stock').value);
  const precio      = parseFloat(document.getElementById('add-precio').value);
  const errEl       = document.getElementById('add-prod-error');
  if (!codigo || !descripcion || isNaN(stock) || isNaN(precio)) {
    errEl.textContent = 'Completá todos los campos.'; return;
  }
  const btn = document.getElementById('btn-save-add-prod');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const res = await callScript({ action: 'addProducto', codigo, descripcion, stock, precio });
    if (res.status === 'ok') {
      document.getElementById('modal-add-prod').classList.remove('open');
      await loadInventario(); await preloadInventario();
    } else { errEl.textContent = res.message || 'Error al guardar.'; }
  } catch(e) { errEl.textContent = 'Error de conexión.'; }
  btn.disabled = false; btn.textContent = 'Agregar';
}

// ── Usuarios ─────────────────────────────────────────────────────
async function loadUsuarios() {
  const loadEl  = document.getElementById('loading-usuarios');
  const wrapEl  = document.getElementById('wrap-usuarios');
  const tbodyEl = document.getElementById('tbody-usuarios');
  if (!loadEl) return;
  loadEl.style.display = 'block'; wrapEl.style.display = 'none';
  try {
    const res = await callScript({ action: 'getUsuarios' });
    if (res.status !== 'ok') { loadEl.textContent = res.message; return; }
    tbodyEl.innerHTML = res.usuarios.map(u => `
      <tr>
        <td style="font-weight:600">${u.usuario}</td>
        <td>${u.rol === 'admin'
          ? '<span class="badge badge-rol-admin">Admin</span>'
          : '<span class="badge badge-rol-vend">Vendedor</span>'}</td>
        <td class="center">
          ${u.usuario.toLowerCase() !== currentUser.usuario.toLowerCase()
            ? `<button class="btn-del-user" onclick="eliminarUsuario('${u.usuario}')">✕ Eliminar</button>`
            : '<span style="color:#9ca3af;font-size:12px">— tú —</span>'}
        </td>
      </tr>`).join('');
    loadEl.style.display = 'none'; wrapEl.style.display = 'block';
  } catch(e) { loadEl.textContent = 'Error al cargar usuarios.'; }
}

function openAddUsuario() {
  ['new-user-name','new-user-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('new-user-rol').value = 'vendedor';
  document.getElementById('add-user-error').textContent = '';
  document.getElementById('modal-add-user').classList.add('open');
}
function cerrarModalAddUser(e) {
  if (e && e.target !== document.getElementById('modal-add-user')) return;
  document.getElementById('modal-add-user').classList.remove('open');
}
async function guardarAddUsuario() {
  const usuario  = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-pass').value.trim();
  const rol      = document.getElementById('new-user-rol').value;
  const errEl    = document.getElementById('add-user-error');
  if (!usuario || !password) { errEl.textContent = 'Completá usuario y contraseña.'; return; }
  const btn = document.getElementById('btn-save-user');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const res = await callScript({ action: 'addUsuario', usuario, password, rol });
    if (res.status === 'ok') {
      document.getElementById('modal-add-user').classList.remove('open');
      await loadUsuarios();
    } else { errEl.textContent = res.message || 'Error.'; }
  } catch(e) { errEl.textContent = 'Error de conexión.'; }
  btn.disabled = false; btn.textContent = 'Crear usuario';
}

async function eliminarUsuario(usuario) {
  if (!confirm(`¿Eliminar al usuario "${usuario}"?`)) return;
  try {
    const res = await callScript({ action: 'deleteUsuario', usuario });
    if (res.status === 'ok') { await loadUsuarios(); }
    else alert(res.message || 'Error al eliminar.');
  } catch(e) { alert('Error de conexión.'); }
}

// ── Resumen ──────────────────────────────────────────────────────
let resumenData = [];
let filtroDesde = null;
let filtroHasta = null;

function parseFechaAR(str) {
  const [d,m,y] = str.split('/');
  return new Date(+y, +m-1, +d);
}
function fechaToISO(d) { return d.toISOString().slice(0,10); }

function setFiltroRapido(tipo, btn) {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (tipo === 'hoy') { filtroDesde = filtroHasta = new Date(hoy); }
  else if (tipo === 'semana') {
    const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay()+6)%7));
    filtroDesde = lunes; filtroHasta = new Date(hoy);
  } else if (tipo === 'mes') {
    filtroDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1); filtroHasta = new Date(hoy);
  } else { filtroDesde = filtroHasta = null; }
  document.getElementById('fecha-desde').value = filtroDesde ? fechaToISO(filtroDesde) : '';
  document.getElementById('fecha-hasta').value = filtroHasta ? fechaToISO(filtroHasta) : '';
  renderResumen();
}
function setFiltroRango() {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  const d = document.getElementById('fecha-desde').value;
  const h = document.getElementById('fecha-hasta').value;
  filtroDesde = d ? new Date(d + 'T00:00:00') : null;
  filtroHasta = h ? new Date(h + 'T23:59:59') : null;
  renderResumen();
}
function filtrarDatos() {
  if (!filtroDesde && !filtroHasta) return resumenData;
  return resumenData.filter(r => {
    const f = parseFechaAR(r[0]||'');
    if (isNaN(f)) return false;
    if (filtroDesde && f < filtroDesde) return false;
    if (filtroHasta) { const h = new Date(filtroHasta); h.setHours(23,59,59); if (f > h) return false; }
    return true;
  });
}
function renderResumen() {
  const data = filtrarDatos();
  const subtotalFn = r => (parseFloat(r[3])||0) * (parseFloat(r[4])||0);
  const total = data.reduce((s,r) => s + subtotalFn(r), 0);
  const dias  = new Set(data.map(r => r[0])).size;
  document.getElementById('m-total' ).textContent = '$' + Math.round(total).toLocaleString('es-AR');
  document.getElementById('m-trans' ).textContent = data.length;
  document.getElementById('m-dias'  ).textContent = dias;
  document.getElementById('m-ticket').textContent = '$' + (data.length ? Math.round(total/data.length).toLocaleString('es-AR') : 0);
  const porResp = {}, porPago = {}, porTurno = {};
  data.forEach(r => {
    const sf = subtotalFn(r), fecha = r[0]||'sin fecha';
    const addTo = (obj, key) => {
      if (!obj[key]) obj[key] = {};
      if (!obj[key][fecha]) obj[key][fecha] = {m:0,n:0};
      obj[key][fecha].m += sf; obj[key][fecha].n++;
    };
    addTo(porResp,  r[7]||'sin dato');
    addTo(porPago,  r[5]||'sin dato');
    addTo(porTurno, r[6]||'sin dato');
  });
  document.getElementById('grupos-resp' ).innerHTML = renderGrupos(porResp,  'resp');
  document.getElementById('grupos-pago' ).innerHTML = renderGrupos(porPago,  'pago');
  document.getElementById('grupos-turno').innerHTML = renderGrupos(porTurno, 'turno');
  renderChart('chart-resp',  porResp,  COLORES_RESP);
  renderChart('chart-pago',  porPago,  COLORES_PAGO);
  renderChart('chart-turno', porTurno, COLORES_TURNO);
}
function renderGrupos(grupos, prefix) {
  return Object.entries(grupos)
    .sort((a,b) => Object.values(b[1]).reduce((s,v)=>s+v.m,0) - Object.values(a[1]).reduce((s,v)=>s+v.m,0))
    .map(([key, fechas], i) => {
      const totalG = Object.values(fechas).reduce((s,v)=>s+v.m,0);
      const transG = Object.values(fechas).reduce((s,v)=>s+v.n,0);
      const uid    = prefix + '-' + i;
      const filas  = Object.entries(fechas)
        .sort((a,b) => parseFechaAR(b[0]) - parseFechaAR(a[0]))
        .map(([fecha,v]) => `<tr class="detalle-fila">
          <td style="padding-left:28px;color:var(--text-muted)">${fecha}</td>
          <td style="font-weight:600">$${Math.round(v.m).toLocaleString('es-AR')}</td>
          <td>${v.n}</td></tr>`).join('');
      return `<div class="grupo-header" onclick="toggleGrupo('${uid}')">
        <span class="grupo-nombre">${key}</span>
        <span class="grupo-stats"><strong>$${Math.round(totalG).toLocaleString('es-AR')}</strong>
        <span class="grupo-trans">${transG} transacc.</span></span>
        <span class="grupo-chevron" id="chev-${uid}">▸</span>
      </div>
      <div class="grupo-detalle" id="det-${uid}" style="display:none">
        <table style="width:100%"><thead><tr><th>Fecha</th><th>Monto</th><th>Transacc.</th></tr></thead>
        <tbody>${filas}</tbody></table>
      </div>`;
    }).join('');
}
function toggleGrupo(uid) {
  const det  = document.getElementById('det-'  + uid);
  const chev = document.getElementById('chev-' + uid);
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : 'block';
  chev.textContent  = open ? '▸' : '▾';
}
async function loadResumen() {
  const loadEl = document.getElementById('loading-resumen');
  loadEl.style.display = 'block';
  document.getElementById('grupos-resp').innerHTML = '';
  document.getElementById('grupos-pago').innerHTML = '';
  document.getElementById('grupos-turno').innerHTML = '';
  try {
    const filas = await fetchSheet(VENTAS_SHEET);
    resumenData = filas.slice(1).filter(r => r[0]);
    loadEl.style.display = 'none';
    if (!filtroDesde && !filtroHasta) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      filtroDesde = filtroHasta = new Date(hoy);
      document.getElementById('fecha-desde').value = fechaToISO(hoy);
      document.getElementById('fecha-hasta').value = fechaToISO(hoy);
    }
    renderResumen();
  } catch(e) { loadEl.textContent = 'Error al cargar resumen.'; }
}

// ── Gráficos ─────────────────────────────────────────────────────
const COLORES_RESP  = ['#4f46e5','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6'];
const COLORES_PAGO  = ['#1e40af','#065f46','#92400e','#7c3aed','#b45309'];
const COLORES_TURNO = ['#1e40af','#92400e','#4c1d95'];
const chartInstances = {};
function renderChart(canvasId, grupos, colores) {
  const keys = Object.keys(grupos);
  if (!keys.length) return;
  const totales = keys.map(key => Math.round(Object.values(grupos[key]).reduce((s,v)=>s+v.m,0)));
  const canvas  = document.getElementById(canvasId);
  if (!canvas) return;
  if (chartInstances[canvasId]) chartInstances[canvasId].destroy();
  chartInstances[canvasId] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: keys,
      datasets: [{ data: totales,
        backgroundColor: colores.slice(0,keys.length).map(c=>c+'dd'),
        borderColor:     colores.slice(0,keys.length), borderWidth:2, hoverOffset:8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '55%',
      plugins: {
        legend: { position:'bottom', labels:{ font:{size:12}, boxWidth:14, padding:16 } },
        tooltip: { callbacks: { label: ctx => {
          const total = ctx.dataset.data.reduce((a,b)=>a+b,0);
          const pct   = total ? Math.round(ctx.parsed/total*100) : 0;
          return ` $${ctx.parsed.toLocaleString('es-AR')}  (${pct}%)`;
        }}}
      }
    }
  });
}

// ── Auditoría ────────────────────────────────────────────────────
let auditTabActual = 'anuladas';

function switchAuditTab(tab, btn) {
  document.querySelectorAll('.audit-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  auditTabActual = tab;
  document.getElementById('audit-anuladas').style.display       = tab === 'anuladas'       ? 'block' : 'none';
  document.getElementById('audit-modificaciones').style.display = tab === 'modificaciones' ? 'block' : 'none';
  if (tab === 'anuladas')       loadAnuladas();
  if (tab === 'modificaciones') loadModificaciones();
}

async function loadAuditoria() {
  // Cargar el tab activo
  if (auditTabActual === 'anuladas') loadAnuladas();
  else loadModificaciones();
}

async function loadAnuladas() {
  const loadEl  = document.getElementById('loading-anuladas');
  const wrapEl  = document.getElementById('wrap-anuladas');
  const emptyEl = document.getElementById('empty-anuladas');
  const tbodyEl = document.getElementById('tbody-anuladas');
  loadEl.style.display = 'block'; wrapEl.style.display = 'none'; emptyEl.style.display = 'none';
  try {
    const filas = await fetchSheet('Anuladas');
    const data  = filas.slice(1).filter(r => r[0]).reverse();
    loadEl.style.display = 'none';
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    // cols: fecha_orig|codigo|desc|precio|cantidad|formaPago|turno|responsable|nroTicket|anulado_por|fecha_anulacion|motivo
    tbodyEl.innerHTML = data.map(r => {
      const subtotal = (parseFloat(r[3]||0)) * (parseFloat(r[4]||0));
      return `<tr class="fila-anulada">
        <td><span class="badge-ticket">${r[8]||'—'}</span></td>
        <td>${r[0]||''}</td>
        <td style="font-family:monospace;font-size:12px">${r[1]||''}</td>
        <td>${r[2]||''}</td>
        <td>$${parseFloat(r[3]||0).toLocaleString('es-AR')}</td>
        <td>${r[4]||''}</td>
        <td style="font-weight:600">$${subtotal.toLocaleString('es-AR')}</td>
        <td>${badgeTurno(r[6]||'')}</td>
        <td>${r[7]||''}</td>
        <td>${badgePago(r[5]||'')}</td>
        <td style="font-weight:600;color:#dc2626">${r[9]||''}</td>
        <td style="color:var(--text-muted);font-size:12px">${r[10]||''}</td>
        <td style="font-style:italic;color:var(--text-muted)">${r[11]||'—'}</td>
      </tr>`;
    }).join('');
    wrapEl.style.display = 'block';
  } catch(e) { loadEl.textContent = 'Error al cargar anuladas.'; }
}

async function loadModificaciones() {
  const loadEl  = document.getElementById('loading-modificaciones');
  const wrapEl  = document.getElementById('wrap-modificaciones');
  const emptyEl = document.getElementById('empty-modificaciones');
  const tbodyEl = document.getElementById('tbody-modificaciones');
  loadEl.style.display = 'block'; wrapEl.style.display = 'none'; emptyEl.style.display = 'none';
  try {
    const filas = await fetchSheet('Auditoria');
    const data  = filas.slice(1).filter(r => r[0]).reverse();
    loadEl.style.display = 'none';
    if (!data.length) { emptyEl.style.display = 'block'; return; }
    // cols: nroTicket|accion|usuario|fecha
    tbodyEl.innerHTML = data.map(r => `<tr>
      <td><span class="badge-ticket">${r[0]||'—'}</span></td>
      <td><span class="badge-accion">${r[1]||''}</span></td>
      <td style="font-weight:600">${r[2]||''}</td>
      <td style="color:var(--text-muted);font-size:12px">${r[3]||''}</td>
    </tr>`).join('');
    wrapEl.style.display = 'block';
  } catch(e) { loadEl.textContent = 'Error al cargar modificaciones.'; }
}

// ── Fondo ────────────────────────────────────────────────────────
const GRADIENTES = [
  { id:'g1',  label:'Índigo',    value:'linear-gradient(135deg,#e0e7ff 0%,#c7d2fe 100%)' },
  { id:'g2',  label:'Menta',     value:'linear-gradient(135deg,#d1fae5 0%,#a7f3d0 100%)' },
  { id:'g3',  label:'Durazno',   value:'linear-gradient(135deg,#fef3c7 0%,#fde68a 100%)' },
  { id:'g4',  label:'Rosa',      value:'linear-gradient(135deg,#fce7f3 0%,#fbcfe8 100%)' },
  { id:'g5',  label:'Cielo',     value:'linear-gradient(135deg,#e0f2fe 0%,#bae6fd 100%)' },
  { id:'g6',  label:'Lavanda',   value:'linear-gradient(135deg,#f3e8ff 0%,#e9d5ff 100%)' },
  { id:'g7',  label:'Salmón',    value:'linear-gradient(135deg,#fee2e2 0%,#fecaca 100%)' },
  { id:'g8',  label:'Lima',      value:'linear-gradient(135deg,#ecfccb 0%,#d9f99d 100%)' },
  { id:'g9',  label:'Aurora',    value:'linear-gradient(135deg,#fdf4ff 0%,#e0f2fe 50%,#d1fae5 100%)' },
  { id:'g10', label:'Atardecer', value:'linear-gradient(135deg,#fef9c3 0%,#fde68a 40%,#fca5a5 100%)' },
  { id:'g11', label:'Océano',    value:'linear-gradient(135deg,#eff6ff 0%,#bfdbfe 50%,#c7d2fe 100%)' },
  { id:'g12', label:'Sin fondo', value:'' },
];
let fondoImagenDataURL = null;
function renderGradientesGrid() {
  const grid = document.getElementById('gradientes-grid');
  if (!grid) return;
  const actualGrad = localStorage.getItem('fondo-gradient') || '';
  const tipoActual = fondoImagenDataURL ? 'image' : (actualGrad ? 'gradient' : '');
  grid.innerHTML = GRADIENTES.map(g => {
    const esActivo = tipoActual === 'gradient' && g.value === actualGrad;
    return `<div class="grad-item ${esActivo ? 'grad-active' : ''}" onclick="setGradiente('${g.id}')"
      title="${g.label}" style="background:${g.value||'#f5f6fa'};border:2px solid ${esActivo?'#4f46e5':'#e4e6ef'}">
      <span class="grad-label">${g.label}</span></div>`;
  }).join('');
}
function setGradiente(id) {
  const g = GRADIENTES.find(x => x.id === id);
  if (!g) return;
  fondoImagenDataURL = null;
  if (g.value) localStorage.setItem('fondo-gradient', g.value);
  else         localStorage.removeItem('fondo-gradient');
  applyFondoToSection(); updatePreview(); renderGradientesGrid(); resetUploadArea();
}
function resetUploadArea() {
  const area = document.getElementById('upload-area');
  if (!area) return;
  area.querySelector('.upload-text').textContent = 'Hacé clic para subir una foto';
  area.querySelector('.upload-hint').textContent = 'JPG, PNG, WEBP — se guarda en tu navegador';
  area.style.borderColor = ''; area.style.background = '';
}
function resetFondo() {
  fondoImagenDataURL = null;
  localStorage.removeItem('fondo-gradient');
  applyFondoToSection(); updatePreview(); renderGradientesGrid(); resetUploadArea();
}
function applyFondoToSection() {
  if (fondoImagenDataURL) {
    document.body.style.backgroundImage      = `url("${fondoImagenDataURL}")`;
    document.body.style.backgroundSize       = 'cover';
    document.body.style.backgroundPosition  = 'center';
    document.body.style.backgroundAttachment = 'fixed';
    document.body.style.backgroundRepeat    = 'no-repeat';
    document.body.style.backgroundColor     = '';
  } else {
    const grad = localStorage.getItem('fondo-gradient') || '';
    document.body.style.backgroundImage      = grad || '';
    document.body.style.backgroundSize       = '';
    document.body.style.backgroundPosition  = '';
    document.body.style.backgroundAttachment = '';
    document.body.style.backgroundRepeat    = '';
    document.body.style.backgroundColor     = grad ? '' : '#f0f4ff';
  }
}
function updatePreview() {
  const preview = document.getElementById('fondo-preview');
  if (!preview) return;
  if (fondoImagenDataURL) {
    preview.style.backgroundImage    = `url("${fondoImagenDataURL}")`;
    preview.style.backgroundSize     = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.style.backgroundRepeat   = 'no-repeat';
  } else {
    const grad = localStorage.getItem('fondo-gradient') || '';
    preview.style.backgroundImage    = grad || '';
    preview.style.backgroundSize     = '';
    preview.style.backgroundPosition = '';
    preview.style.backgroundRepeat   = '';
    preview.style.backgroundColor    = grad ? '' : '#f5f6fa';
  }
}
function initFondo() {
  const input = document.getElementById('img-input');
  if (input) {
    input.addEventListener('change', function() {
      if (!this.files || !this.files[0]) return;
      const file = this.files[0]; const fileName = file.name;
      const reader = new FileReader();
      reader.onload = function(e) {
        fondoImagenDataURL = e.target.result;
        localStorage.removeItem('fondo-gradient');
        applyFondoToSection(); updatePreview(); renderGradientesGrid();
        const area = document.getElementById('upload-area');
        if (area) {
          area.querySelector('.upload-text').textContent = '✓ ' + fileName;
          area.querySelector('.upload-hint').textContent = 'Clic para cambiar la imagen';
          area.style.borderColor = '#059669'; area.style.background = '#f0fdf4';
        }
        input.value = '';
      };
      reader.readAsDataURL(file);
    });
  }
  applyFondoToSection(); updatePreview();
}

// ── Variables para anular/modificar ─────────────────────────────
let ticketActual = null;

// ── Buscar ticket ────────────────────────────────────────────────
async function buscarTicket() {
  const nro    = document.getElementById('buscar-nro').value.trim().toUpperCase();
  const loadEl = document.getElementById('loading-buscar');
  const errEl  = document.getElementById('error-buscar');
  const resEl  = document.getElementById('resultado-ticket');
  if (!nro) { errEl.textContent = 'Ingresá un número de ticket.'; errEl.style.display='block'; return; }
  errEl.style.display = 'none'; resEl.style.display = 'none';
  loadEl.style.display = 'block';
  try {
    const res = await callScript({ action: 'buscarTicket', nroTicket: nro });
    loadEl.style.display = 'none';
    if (res.status !== 'ok') { errEl.textContent = res.message || 'Ticket no encontrado.'; errEl.style.display='block'; return; }
    const t = res.ticket;
    document.getElementById('te-nro').textContent = '# ' + t.nro;
    document.getElementById('te-meta').innerHTML = `
      <span>${t.fecha}</span>
      ${badgeTurno(t.turno)}
      ${badgePago(t.formaPago)}
      <strong>${t.responsable}</strong>`;
    document.getElementById('te-items').innerHTML = t.items.map(i => `
      <div class="te-item">
        <span class="te-item-desc">${i.descripcion||i.codigo}</span>
        <span class="right">${i.cantidad}</span>
        <span class="right">$${i.precio.toLocaleString('es-AR')}</span>
        <span class="right" style="font-weight:700">$${i.subtotal.toLocaleString('es-AR')}</span>
      </div>`).join('');
    document.getElementById('te-total').textContent = '$' + Math.round(t.total).toLocaleString('es-AR');
    ticketActual = t;
    // Mostrar botones según permisos
    const isAdmin   = currentUser.rol === 'admin';
    const esMio     = t.responsable.toUpperCase() === currentUser.usuario.toUpperCase();
    const puedeAct  = isAdmin || esMio;
    const actionsEl = document.getElementById('te-actions');
    if (actionsEl && puedeAct) {
      actionsEl.innerHTML = `
        <button class="btn-mod-ticket" onclick="abrirModificar()">✏ Modificar</button>
        <button class="btn-anular-ticket" onclick="abrirAnular()">✕ Anular ticket</button>`;
    } else if (actionsEl) {
      actionsEl.innerHTML = '<span class="te-sin-permiso">Solo el admin o el responsable puede modificar esta venta.</span>';
    }
    resEl.style.display = 'block';
  } catch(e) { loadEl.style.display='none'; errEl.textContent='Error de conexión.'; errEl.style.display='block'; }
}

// ── Anular ticket ────────────────────────────────────────────────
function abrirAnular() {
  if (!ticketActual) return;
  document.getElementById('anular-nro-label').textContent = '# ' + ticketActual.nro;
  document.getElementById('anular-motivo').value = '';
  document.getElementById('anular-error').textContent = '';
  document.getElementById('modal-anular').classList.add('open');
}
function cerrarModalAnular(e) {
  if (e && e.target !== document.getElementById('modal-anular')) return;
  document.getElementById('modal-anular').classList.remove('open');
}
async function confirmarAnular() {
  const motivo = document.getElementById('anular-motivo').value.trim();
  const errEl  = document.getElementById('anular-error');
  const btn    = document.getElementById('btn-confirmar-anular');
  btn.disabled = true; btn.textContent = 'Anulando...';
  errEl.textContent = '';
  try {
    const res = await callScript({
      action: 'anularTicket',
      nroTicket:  ticketActual.nro,
      anuladoPor: currentUser.usuario,
      motivo
    });
    if (res.status === 'ok') {
      document.getElementById('modal-anular').classList.remove('open');
      document.getElementById('resultado-ticket').style.display = 'none';
      document.getElementById('buscar-nro').value = '';
      ticketActual = null;
      mostrarMensajeExito('Ticket anulado y movido a hoja Anuladas. Stock repuesto.');
    } else { errEl.textContent = res.message || 'Error al anular.'; }
  } catch(e) { errEl.textContent = 'Error de conexión.'; }
  btn.disabled = false; btn.textContent = 'Confirmar anulación';
}

// ── Modificar ticket ──────────────────────────────────────────────
function abrirModificar() {
  if (!ticketActual) return;
  document.getElementById('modificar-nro-label').textContent = '# ' + ticketActual.nro;
  document.getElementById('modificar-error').textContent = '';
  // Renderizar items editables
  document.getElementById('mod-items').innerHTML = ticketActual.items.map((item, i) => `
    <div class="mod-item-row">
      <span class="mod-desc">${item.descripcion||item.codigo}</span>
      <input type="number" class="mod-input" id="mod-cant-${i}" value="${item.cantidad}" min="0" step="1" placeholder="Cant.">
      <input type="number" class="mod-input" id="mod-precio-${i}" value="${item.precio}" min="0" step="0.01" placeholder="Precio">
      <select class="mod-select" id="mod-pago-${i}">
        ${['EFECTIVO','TRANSFERENCIA','CIGARRILLOS EFECT.','CIGARRILLOS MP']
          .map(p => `<option ${p===ticketActual.formaPago?'selected':''}>${p}</option>`).join('')}
      </select>
      <button class="mod-del" onclick="this.closest('.mod-item-row').remove()">✕</button>
    </div>`).join('');
  document.getElementById('modal-modificar').classList.add('open');
}
function cerrarModalModificar(e) {
  if (e && e.target !== document.getElementById('modal-modificar')) return;
  document.getElementById('modal-modificar').classList.remove('open');
}
async function confirmarModificar() {
  const errEl = document.getElementById('modificar-error');
  const btn   = document.getElementById('btn-confirmar-mod');
  btn.disabled = true; btn.textContent = 'Guardando...';
  errEl.textContent = '';
  try {
    const fecha = ticketActual.fecha;
    const turno = ticketActual.turno;
    const resp  = ticketActual.responsable;
    const items = ticketActual.items.map((item, i) => {
      const cant   = parseFloat(document.getElementById('mod-cant-'+i)?.value || 0);
      const precio = parseFloat(document.getElementById('mod-precio-'+i)?.value || 0);
      const pago   = document.getElementById('mod-pago-'+i)?.value || ticketActual.formaPago;
      return { fecha, codigo: item.codigo, descripcion: item.descripcion, precio, cantidad: cant, formaPago: pago, turno, responsable: resp };
    }).filter(it => it.cantidad > 0);
    if (!items.length) { errEl.textContent = 'Debe quedar al menos un ítem.'; btn.disabled=false; btn.textContent='Guardar cambios'; return; }
    const res = await callScript({
      action: 'modificarTicket',
      nroTicket:    ticketActual.nro,
      modificadoPor: currentUser.usuario,
      items
    });
    if (res.status === 'ok') {
      document.getElementById('modal-modificar').classList.remove('open');
      mostrarMensajeExito('Ticket modificado correctamente.');
      // Refrescar resultado
      document.getElementById('buscar-nro').value = ticketActual.nro;
      await buscarTicket();
    } else { errEl.textContent = res.message || 'Error al modificar.'; }
  } catch(e) { errEl.textContent = 'Error de conexión.'; }
  btn.disabled = false; btn.textContent = 'Guardar cambios';
}

function mostrarMensajeExito(msg) {
  const el = document.getElementById('error-buscar');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '#ecfdf5';
  el.style.color = '#065f46';
  el.style.borderColor = '#6ee7b7';
  setTimeout(() => { el.style.display='none'; el.style.background=''; el.style.color=''; el.style.borderColor=''; }, 4000);
}

// ── Ticket ───────────────────────────────────────────────────────
function showTicket(items, pago, turno, responsable, nroTicket='') {
  const fecha = new Date().toLocaleDateString('es-AR');
  const hora  = new Date().toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'});
  document.getElementById('ticket-fecha').textContent = `${fecha}  ${hora}`;
  const nroEl = document.getElementById('ticket-nro');
  if (nroEl) nroEl.textContent = nroTicket ? '# ' + nroTicket : '';
  document.getElementById('ticket-meta').innerHTML = `
    <span class="badge b-turno-${turno==='MAÑANA'?'m':turno==='TARDE'?'t':'n'}">${turno}</span>
    <span class="badge ${pago==='EFECTIVO'?'b-ef':pago==='TRANSFERENCIA'?'b-tr':'b-cig'}">${pago}</span>
    <span class="ticket-resp">${responsable}</span>`;
  const total = items.reduce((s,i)=>s+i.subtotal,0);
  document.getElementById('ticket-items').innerHTML = items.map(i=>`
    <div class="ticket-item">
      <span class="ticket-item-desc">${i.descripcion||i.codigo}</span>
      <span class="right">${i.cantidad}</span>
      <span class="right">$${i.subtotal.toLocaleString('es-AR')}</span>
    </div>`).join('');
  document.getElementById('ticket-total').textContent = '$' + total.toLocaleString('es-AR');
  document.getElementById('modal-ticket').classList.add('open');
}
function cerrarTicket(e) {
  if (e && e.target !== document.getElementById('modal-ticket')) return;
  document.getElementById('modal-ticket').classList.remove('open');
}

// ── Helpers visuales ─────────────────────────────────────────────
function badgePago(p) {
  const cls = p==='EFECTIVO'?'b-ef':p==='TRANSFERENCIA'?'b-tr':'b-cig';
  return `<span class="badge ${cls}">${p}</span>`;
}
function badgeTurno(t) {
  const cls = t==='MAÑANA'?'b-turno-m':t==='TARDE'?'b-turno-t':'b-turno-n';
  return `<span class="badge ${cls}">${t}</span>`;
}
function showSuccess() {
  const el = document.getElementById('success-msg');
  el.style.display = 'block'; setTimeout(()=>el.style.display='none',4000);
}
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg; el.style.display = 'block';
}
function hideMessages() {
  document.getElementById('success-msg').style.display = 'none';
  document.getElementById('error-msg').style.display   = 'none';
}

// ── Init ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Restaurar sesión si existe
  const saved = sessionStorage.getItem('currentUser');
  if (saved) {
    try { currentUser = JSON.parse(saved); startApp(); return; } catch(e) {}
  }
  document.getElementById('login-screen').style.display = 'flex';
});
