const SHEET_ID     = window.APP_CONFIG?.SHEET_ID     || '';
const API_KEY      = window.APP_CONFIG?.API_KEY       || '';
const SCRIPT_URL   = window.APP_CONFIG?.SCRIPT_URL    || '';
const VENTAS_SHEET = 'Respuestas formulario';
const INV_SHEET    = 'Inventario';

let rows = [];
let nextId = 1;
let inventarioDB = [];

window.addEventListener('DOMContentLoaded', () => {
  addRow();
  preloadInventario();
});

// ── Precarga inventario al iniciar para el autocompletado ──
async function preloadInventario() {
  try {
    const data = await fetchSheet(INV_SHEET);
    // fila 0 = "INVENTARIO" (título), fila 1 = encabezados, fila 2+ = datos
    const filas = data.slice(2);
    inventarioDB = filas.map(r => ({
      codigo: String(r[0] || '').trim(),
      desc:   String(r[1] || '').trim(),
      stock:  parseFloat(r[2] || 0),
      precio: 100
    }));
  } catch(e) {
    console.warn('No se pudo precargar inventario:', e);
  }
}

// ── Navegación ──
function showTab(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'historial')  loadHistorial();
  if (tab === 'inventario') loadInventario();
  if (tab === 'resumen')    loadResumen();
}

// ── Grilla estilo Excel ──
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
  renderGrid();
  updateTotal();
}

function getRow(id) { return rows.find(r => r.id === id); }

function onCodigoInput(id) {
  const row = getRow(id);
  row.codigo = document.getElementById('cod-' + id).value.trim();
  const prod = inventarioDB.find(p => p.codigo === row.codigo);
  if (prod) {
    row.desc   = prod.desc;
    row.precio = prod.precio || 100;
    document.getElementById('desc-'   + id).value = prod.desc;
    document.getElementById('precio-' + id).value = prod.precio || 100;
    setTimeout(() => document.getElementById('cant-' + id).focus(), 20);
  }
}

function onDescInput(id)   { getRow(id).desc   = document.getElementById('desc-'   + id).value; }
function onPrecioInput(id) {
  getRow(id).precio = document.getElementById('precio-' + id).value;
  updateSubtotal(id);
}

function onCantidadInput(id) {
  const row = getRow(id);
  row.cantidad = document.getElementById('cant-' + id).value;
  updateSubtotal(id);
  updateTotal();
}

function onCantidadKey(id, e) {
  if (e.key === 'Enter' || e.key === 'Tab') {
    const row = getRow(id);
    if (row.codigo && row.cantidad) {
      if (rows[rows.length - 1].id === id) {
        e.preventDefault();
        addRow();
        setTimeout(() => document.getElementById('cod-' + rows[rows.length-1].id).focus(), 40);
      }
    }
  }
}

function updateSubtotal(id) {
  const row = getRow(id);
  const sub = (parseFloat(row.precio) || 0) * (parseFloat(row.cantidad) || 0);
  const el  = document.getElementById('sub-' + id);
  if (el) el.textContent = sub > 0 ? '$' + sub.toLocaleString('es-AR') : '—';
  updateTotal();
}

function updateTotal() {
  const total = rows.reduce((s, r) => s + (parseFloat(r.precio)||0) * (parseFloat(r.cantidad)||0), 0);
  document.getElementById('total-valor').textContent = '$' + total.toLocaleString('es-AR');
}

function renderGrid() {
  const body = document.getElementById('grid-body');
  body.innerHTML = rows.map(row => {
    const isEmpty = !row.codigo && !row.desc && !row.precio && !row.cantidad;
    const isLast  = rows[rows.length - 1].id === row.id;
    const sub     = (parseFloat(row.precio)||0) * (parseFloat(row.cantidad)||0);
    return `
      <div class="grid-row ${isLast && isEmpty ? 'empty-row' : ''}">
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

// ── Guardar venta ──
async function guardarVenta() {
  const pago        = document.getElementById('pago').value;
  const turno       = document.getElementById('turno').value;
  const responsable = document.getElementById('responsable').value;
  const items       = rows.filter(r => r.codigo && r.precio && r.cantidad);

  if (!items.length || !pago || !turno || !responsable) {
    showError('Completá todos los campos y agregá al menos un producto.');
    return;
  }

  const btn = document.getElementById('btn-guardar');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  hideMessages();

  const fecha = new Date().toLocaleDateString('es-AR');
  const payload = items.map(item => ({
    fecha,
    codigo:      item.codigo,
    descripcion: item.desc,
    precio:      parseFloat(item.precio),
    cantidad:    parseFloat(item.cantidad),
    subtotal:    parseFloat(item.precio) * parseFloat(item.cantidad),
    formaPago:   pago,
    turno,
    responsable
  }));

  try {
    const res = await fetch(SCRIPT_URL, {
      method:  'POST',
      mode:    'no-cors',       // ← necesario para Apps Script desde dominios externos
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({ action: 'addVentas', ventas: payload })
    });
    // con no-cors no podemos leer la respuesta, asumimos éxito si no hay excepción
    showTicket(payload, pago, turno, responsable);
    rows = []; nextId = 1; addRow();
    ['pago','turno','responsable'].forEach(id => document.getElementById(id).value = '');
    updateTotal();
    await preloadInventario();
  } catch (err) {
    showError('No se pudo conectar. Verificá tu conexión a internet.');
  }

  btn.disabled = false;
  btn.textContent = 'Registrar venta';
}

// ── Leer datos de Google Sheets ──
async function fetchSheet(sheetName) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return data.values || [];
}

async function loadHistorial() {
  const loadEl  = document.getElementById('loading-historial');
  const wrapEl  = document.getElementById('wrap-historial');
  const tbodyEl = document.getElementById('tbody-historial');
  loadEl.style.display = 'block';
  loadEl.textContent   = 'Cargando...';
  wrapEl.style.display = 'none';

  try {
    const filas = await fetchSheet(VENTAS_SHEET);
    // fila 0 = encabezado
    const data = filas.slice(1).filter(r => r[0]).reverse();
    if (!data.length) { loadEl.textContent = 'Sin ventas registradas.'; return; }
    // r[0]=fecha r[1]=codigo r[2]=desc r[3]=precio r[4]=cantidad r[5]=pago r[6]=turno r[7]=responsable
    tbodyEl.innerHTML = data.map(r => {
      const subtotal = (parseFloat(r[3]||0)) * (parseFloat(r[4]||0));
      return `
      <tr>
        <td>${r[0]||''}</td>
        <td style="font-family:monospace;font-size:12px">${r[1]||''}</td>
        <td>${r[2]||''}</td>
        <td>$${parseFloat(r[3]||0).toLocaleString('es-AR')}</td>
        <td>${r[4]||''}</td>
        <td style="font-weight:600">$${subtotal.toLocaleString('es-AR')}</td>
        <td>${badgeTurno(r[6]||'')}</td>
        <td>${r[7]||''}</td>
        <td>${badgePago(r[5]||'')}</td>
      </tr>`;}).join('');
    loadEl.style.display = 'none';
    wrapEl.style.display = 'block';
  } catch(e) {
    loadEl.textContent = 'Error al cargar. Verificá la configuración.';
  }
}

async function loadInventario() {
  const loadEl  = document.getElementById('loading-inventario');
  const wrapEl  = document.getElementById('wrap-inventario');
  const tbodyEl = document.getElementById('tbody-inventario');
  loadEl.style.display = 'block';
  loadEl.textContent   = 'Cargando...';
  wrapEl.style.display = 'none';

  try {
    const filas = await fetchSheet(INV_SHEET);
    // fila 0 = "INVENTARIO" (título), fila 1 = encabezados, fila 2+ = datos
    const data = filas.slice(2);
    if (!data.length) { loadEl.textContent = 'Sin datos de inventario.'; return; }

    inventarioDB = data.map(r => ({
      codigo: String(r[0]||'').trim(),
      desc:   String(r[1]||'').trim(),
      stock:  parseFloat(r[2]||0),
      precio: 100
    }));

    tbodyEl.innerHTML = inventarioDB.map(p => `
      <tr>
        <td style="font-family:monospace;font-size:12px">${p.codigo}</td>
        <td>${p.desc}</td>
        <td class="right" style="font-weight:600">${p.stock}</td>
        <td class="center">${p.stock <= 3
          ? '<span class="badge b-low">STOCK BAJO</span>'
          : p.stock <= 8
            ? '<span class="badge b-cig">STOCK MEDIO</span>'
            : '<span class="badge b-ok">OK</span>'}</td>
      </tr>`).join('');

    loadEl.style.display = 'none';
    wrapEl.style.display = 'block';
  } catch(e) {
    loadEl.textContent = 'Error al cargar inventario.';
  }
}

// ── Resumen con filtros ──
let resumenData = [];   // todos los datos crudos
let filtroDesde = null;
let filtroHasta = null;

function parseFechaAR(str) {
  // formato dd/mm/yyyy
  const [d, m, y] = str.split('/');
  return new Date(+y, +m - 1, +d);
}

function fechaToISO(d) {
  return d.toISOString().slice(0, 10);
}

function setFiltroRapido(tipo, btn) {
  document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  if (tipo === 'hoy') {
    filtroDesde = filtroHasta = new Date(hoy);
  } else if (tipo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    filtroDesde = lunes; filtroHasta = new Date(hoy);
  } else if (tipo === 'mes') {
    filtroDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    filtroHasta = new Date(hoy);
  } else {
    filtroDesde = filtroHasta = null;
  }
  // Sincronizar inputs de fecha
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
    const f = parseFechaAR(r[0] || '');
    if (isNaN(f)) return false;
    if (filtroDesde && f < filtroDesde) return false;
    if (filtroHasta) {
      const hasta = new Date(filtroHasta); hasta.setHours(23,59,59);
      if (f > hasta) return false;
    }
    return true;
  });
}

function renderResumen() {
  const data = filtrarDatos();
  const subtotalFn = r => (parseFloat(r[3])||0) * (parseFloat(r[4])||0);

  const total = data.reduce((s, r) => s + subtotalFn(r), 0);
  const dias  = new Set(data.map(r => r[0])).size;

  document.getElementById('m-total' ).textContent = '$' + Math.round(total).toLocaleString('es-AR');
  document.getElementById('m-trans' ).textContent = data.length;
  document.getElementById('m-dias'  ).textContent = dias;
  document.getElementById('m-ticket').textContent = '$' + (data.length ? Math.round(total / data.length).toLocaleString('es-AR') : 0);

  // Agrupar por responsable
  const porResp = {};
  data.forEach(r => {
    const key = r[7] || 'sin dato';
    if (!porResp[key]) porResp[key] = {};
    const fecha = r[0] || 'sin fecha';
    if (!porResp[key][fecha]) porResp[key][fecha] = { m: 0, n: 0 };
    porResp[key][fecha].m += subtotalFn(r);
    porResp[key][fecha].n++;
  });
  document.getElementById('grupos-resp').innerHTML = renderGrupos(porResp, 'resp');

  // Agrupar por forma de pago
  const porPago = {};
  data.forEach(r => {
    const key = r[5] || 'sin dato';
    if (!porPago[key]) porPago[key] = {};
    const fecha = r[0] || 'sin fecha';
    if (!porPago[key][fecha]) porPago[key][fecha] = { m: 0, n: 0 };
    porPago[key][fecha].m += subtotalFn(r);
    porPago[key][fecha].n++;
  });
  document.getElementById('grupos-pago').innerHTML = renderGrupos(porPago, 'pago');
}

function renderGrupos(grupos, prefix) {
  return Object.entries(grupos)
    .sort((a, b) => {
      const sa = Object.values(a[1]).reduce((s,v) => s+v.m, 0);
      const sb = Object.values(b[1]).reduce((s,v) => s+v.m, 0);
      return sb - sa;
    })
    .map(([key, fechas], i) => {
      const totalGrupo = Object.values(fechas).reduce((s,v) => s+v.m, 0);
      const transGrupo = Object.values(fechas).reduce((s,v) => s+v.n, 0);
      const uid = prefix + '-' + i;
      const filas = Object.entries(fechas)
        .sort((a, b) => {
          const fa = parseFechaAR(a[0]), fb = parseFechaAR(b[0]);
          return fb - fa;
        })
        .map(([fecha, v]) => `
          <tr class="detalle-fila">
            <td style="padding-left:28px;color:var(--text-muted)">${fecha}</td>
            <td style="font-weight:600">$${Math.round(v.m).toLocaleString('es-AR')}</td>
            <td>${v.n}</td>
          </tr>`).join('');
      return `
        <div class="grupo-header" onclick="toggleGrupo('${uid}')">
          <span class="grupo-nombre">${key}</span>
          <span class="grupo-stats">
            <strong>$${Math.round(totalGrupo).toLocaleString('es-AR')}</strong>
            <span class="grupo-trans">${transGrupo} transacc.</span>
          </span>
          <span class="grupo-chevron" id="chev-${uid}">▸</span>
        </div>
        <div class="grupo-detalle" id="det-${uid}" style="display:none">
          <table style="width:100%">
            <thead><tr>
              <th>Fecha</th><th>Monto</th><th>Transacc.</th>
            </tr></thead>
            <tbody>${filas}</tbody>
          </table>
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

  try {
    const filas = await fetchSheet(VENTAS_SHEET);
    resumenData = filas.slice(1).filter(r => r[0]);
    loadEl.style.display = 'none';

    // Aplicar filtro "Hoy" por defecto si es la primera vez
    if (!filtroDesde && !filtroHasta) {
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      filtroDesde = filtroHasta = new Date(hoy);
      document.getElementById('fecha-desde').value = fechaToISO(hoy);
      document.getElementById('fecha-hasta').value = fechaToISO(hoy);
    }

    renderResumen();
  } catch(e) {
    loadEl.textContent = 'Error al cargar resumen.';
  }
}

// ── Helpers ──
function badgePago(p) {
  const cls = p === 'EFECTIVO' ? 'b-ef' : p === 'TRANSFERENCIA' ? 'b-tr' : 'b-cig';
  return `<span class="badge ${cls}">${p}</span>`;
}
function badgeTurno(t) {
  const cls = t === 'MAÑANA' ? 'b-turno-m' : t === 'TARDE' ? 'b-turno-t' : 'b-turno-n';
  return `<span class="badge ${cls}">${t}</span>`;
}
function showTicket(items, pago, turno, responsable) {
  const fecha = new Date().toLocaleDateString('es-AR');
  const hora  = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  document.getElementById('ticket-fecha').textContent = `${fecha}  ${hora}`;

  document.getElementById('ticket-meta').innerHTML = `
    <span class="badge b-turno-${turno==='MAÑANA'?'m':turno==='TARDE'?'t':'n'}">${turno}</span>
    <span class="badge ${pago==='EFECTIVO'?'b-ef':pago==='TRANSFERENCIA'?'b-tr':'b-cig'}">${pago}</span>
    <span class="ticket-resp">${responsable}</span>`;

  const total = items.reduce((s, i) => s + i.subtotal, 0);

  document.getElementById('ticket-items').innerHTML = items.map(i => `
    <div class="ticket-item">
      <span class="ticket-item-desc">${i.descripcion || i.codigo}</span>
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


function showSuccess() {
  const el = document.getElementById('success-msg');
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}
function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}
function hideMessages() {
  document.getElementById('success-msg').style.display = 'none';
  document.getElementById('error-msg').style.display   = 'none';
}
