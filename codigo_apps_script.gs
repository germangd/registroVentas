function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // ── Registrar ventas con número de ticket ────────────────────
    if (data.action === 'addVentas') {
      const sheet = ss.getSheetByName('Respuestas formulario');
      const nroTicket = generarNroTicket(sheet, data.ventas[0].responsable);
      data.ventas.forEach(v => {
        // Columnas: fecha | codigo | descripcion | precio | cantidad | formaPago | turno | responsable | nroTicket
        sheet.appendRow([v.fecha, v.codigo, v.descripcion, v.precio, v.cantidad, v.formaPago, v.turno, v.responsable, nroTicket]);
        const inv   = ss.getSheetByName('Inventario');
        const datos = inv.getDataRange().getValues();
        for (let i = 2; i < datos.length; i++) {
          if (String(datos[i][0]).trim() === String(v.codigo).trim()) {
            inv.getRange(i + 1, 3).setValue(Math.max(0, (parseFloat(datos[i][2]) || 0) - v.cantidad));
            break;
          }
        }
      });
      return buildResponse({ status: 'ok', nroTicket });
    }

    // ── Buscar por número de ticket ──────────────────────────────
    if (data.action === 'buscarTicket') {
      const sheet = ss.getSheetByName('Respuestas formulario');
      const filas = sheet.getDataRange().getValues();
      const nro   = String(data.nroTicket).trim().toUpperCase();
      // Columna 8 (índice) = nroTicket
      const items = filas.slice(1).filter(r => String(r[8]||'').trim().toUpperCase() === nro);
      if (!items.length) return buildResponse({ status: 'error', message: 'Ticket no encontrado' });
      return buildResponse({
        status: 'ok',
        ticket: {
          nro,
          fecha:       items[0][0],
          turno:       items[0][6],
          responsable: items[0][7],
          formaPago:   items[0][5],
          items: items.map(r => ({
            codigo:      r[1],
            descripcion: r[2],
            precio:      parseFloat(r[3]||0),
            cantidad:    parseFloat(r[4]||0),
            subtotal:    parseFloat(r[3]||0) * parseFloat(r[4]||0)
          })),
          total: items.reduce((s,r) => s + parseFloat(r[3]||0)*parseFloat(r[4]||0), 0)
        }
      });
    }

    // ── Login ────────────────────────────────────────────────────
    if (data.action === 'login') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe. Ejecutá setupUsuarios().' });
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === data.usuario.trim().toLowerCase()
            && String(rows[i][1]).trim() === data.password.trim()) {
          return buildResponse({ status: 'ok', usuario: String(rows[i][0]).trim(), rol: String(rows[i][2]).trim().toLowerCase() });
        }
      }
      return buildResponse({ status: 'error', message: 'Usuario o contraseña incorrectos' });
    }

    // ── Actualizar precio ────────────────────────────────────────
    if (data.action === 'updatePrecio') {
      const inv = ss.getSheetByName('Inventario');
      const datos = inv.getDataRange().getValues();
      for (let i = 2; i < datos.length; i++) {
        if (String(datos[i][0]).trim() === String(data.codigo).trim()) {
          inv.getRange(i + 1, 4).setValue(parseFloat(data.precio));
          return buildResponse({ status: 'ok' });
        }
      }
      return buildResponse({ status: 'error', message: 'Producto no encontrado' });
    }

    // ── Actualizar stock ─────────────────────────────────────────
    if (data.action === 'updateStock') {
      const inv = ss.getSheetByName('Inventario');
      const datos = inv.getDataRange().getValues();
      for (let i = 2; i < datos.length; i++) {
        if (String(datos[i][0]).trim() === String(data.codigo).trim()) {
          inv.getRange(i + 1, 3).setValue(parseFloat(data.stock));
          return buildResponse({ status: 'ok' });
        }
      }
      return buildResponse({ status: 'error', message: 'Producto no encontrado' });
    }

    // ── Agregar producto ─────────────────────────────────────────
    if (data.action === 'addProducto') {
      const inv = ss.getSheetByName('Inventario');
      inv.appendRow([data.codigo.trim(), data.descripcion.trim(), parseFloat(data.stock), parseFloat(data.precio)]);
      return buildResponse({ status: 'ok' });
    }

    // ── Gestión usuarios ─────────────────────────────────────────
    if (data.action === 'getUsuarios') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe' });
      const usuarios = sheet.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({ usuario: r[0], rol: r[2] }));
      return buildResponse({ status: 'ok', usuarios });
    }

    if (data.action === 'addUsuario') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe' });
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === data.usuario.trim().toLowerCase())
          return buildResponse({ status: 'error', message: 'El usuario ya existe' });
      }
      sheet.appendRow([data.usuario.trim(), data.password.trim(), data.rol.trim()]);
      return buildResponse({ status: 'ok' });
    }

    if (data.action === 'deleteUsuario') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe' });
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === data.usuario.trim().toLowerCase()) {
          sheet.deleteRow(i + 1);
          return buildResponse({ status: 'ok' });
        }
      }
      return buildResponse({ status: 'error', message: 'Usuario no encontrado' });
    }

    if (data.action === 'changePassword') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe' });
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === data.usuario.trim().toLowerCase()) {
          sheet.getRange(i + 1, 2).setValue(data.password.trim());
          return buildResponse({ status: 'ok' });
        }
      }
      return buildResponse({ status: 'error', message: 'Usuario no encontrado' });
    }

    // ── Anular ticket ─────────────────────────────────────────────
    if (data.action === 'anularTicket') {
      const sheet    = ss.getSheetByName('Respuestas formulario');
      const anuladas = ss.getSheetByName('Anuladas') || ss.insertSheet('Anuladas');
      // Crear encabezados si la hoja está vacía
      if (anuladas.getLastRow() === 0) {
        anuladas.appendRow(['fecha_orig','codigo','descripcion','precio','cantidad','formaPago','turno','responsable','nroTicket','anulado_por','fecha_anulacion','motivo']);
      }
      const filas   = sheet.getDataRange().getValues();
      const nro     = String(data.nroTicket).trim().toUpperCase();
      const inv     = ss.getSheetByName('Inventario');
      const invData = inv.getDataRange().getValues();
      let found = false;
      // Recorrer de atrás para adelante para no perder índices al borrar
      for (let i = filas.length - 1; i >= 1; i--) {
        if (String(filas[i][8]||'').trim().toUpperCase() === nro) {
          found = true;
          // Reponer stock
          const codigo   = String(filas[i][1]).trim();
          const cantidad = parseFloat(filas[i][4]||0);
          for (let j = 2; j < invData.length; j++) {
            if (String(invData[j][0]).trim() === codigo) {
              inv.getRange(j+1,3).setValue((parseFloat(invData[j][2])||0) + cantidad);
              break;
            }
          }
          // Mover a Anuladas
          const fila = filas[i].slice(0,9);
          fila.push(data.anuladoPor, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'), data.motivo||'');
          anuladas.appendRow(fila);
          sheet.deleteRow(i+1);
        }
      }
      if (!found) return buildResponse({ status: 'error', message: 'Ticket no encontrado' });
      return buildResponse({ status: 'ok' });
    }

    // ── Modificar ticket ──────────────────────────────────────────
    if (data.action === 'modificarTicket') {
      const sheet  = ss.getSheetByName('Respuestas formulario');
      const filas  = sheet.getDataRange().getValues();
      const nro    = String(data.nroTicket).trim().toUpperCase();
      const inv    = ss.getSheetByName('Inventario');
      const invData = inv.getDataRange().getValues();

      // Primero revertir el stock de los items originales
      for (let i = 1; i < filas.length; i++) {
        if (String(filas[i][8]||'').trim().toUpperCase() === nro) {
          const codigo   = String(filas[i][1]).trim();
          const cantidad = parseFloat(filas[i][4]||0);
          for (let j = 2; j < invData.length; j++) {
            if (String(invData[j][0]).trim() === codigo) {
              inv.getRange(j+1,3).setValue((parseFloat(invData[j][2])||0) + cantidad);
              break;
            }
          }
        }
      }

      // Borrar filas originales del ticket
      for (let i = filas.length - 1; i >= 1; i--) {
        if (String(filas[i][8]||'').trim().toUpperCase() === nro) {
          sheet.deleteRow(i+1);
        }
      }

      // Insertar filas modificadas y descontar nuevo stock
      const invData2 = inv.getDataRange().getValues();
      data.items.forEach(v => {
        sheet.appendRow([v.fecha, v.codigo, v.descripcion, v.precio, v.cantidad, v.formaPago, v.turno, v.responsable, nro]);
        for (let j = 2; j < invData2.length; j++) {
          if (String(invData2[j][0]).trim() === String(v.codigo).trim()) {
            inv.getRange(j+1,3).setValue(Math.max(0,(parseFloat(invData2[j][2])||0) - v.cantidad));
            break;
          }
        }
      });

      // Registrar en auditoría
      let audit = ss.getSheetByName('Auditoria');
      if (!audit) { audit = ss.insertSheet('Auditoria'); audit.appendRow(['nroTicket','accion','usuario','fecha']); }
      audit.appendRow([nro,'MODIFICACION',data.modificadoPor, Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'dd/MM/yyyy HH:mm')]);

      return buildResponse({ status: 'ok' });
    }

    return buildResponse({ status: 'error', message: 'Acción desconocida' });
  } catch(err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

// ── Genera número de ticket: XX-NNN (iniciales responsable + correlativo global) ──
function generarNroTicket(sheet, responsable) {
  const iniciales = String(responsable || 'XX').trim().substring(0, 2).toUpperCase();
  const filas     = sheet.getDataRange().getValues();
  // Contar tickets únicos globales (columna 8 = nroTicket)
  const ticketsExistentes = new Set(filas.slice(1).map(r => r[8]).filter(v => v));
  const nro = String(ticketsExistentes.size + 1).padStart(3, '0');
  return `${iniciales}-${nro}`;
}

function doGet(e) {
  return buildResponse({ status: 'ok', message: 'API activa' });
}

function buildResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setupUsuarios() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Usuarios');
  if (!sheet) {
    sheet = ss.insertSheet('Usuarios');
    sheet.appendRow(['usuario', 'contraseña', 'rol']);
    sheet.appendRow(['admin', 'admin123', 'admin']);
    sheet.appendRow(['vendedor', '1234', 'vendedor']);
    SpreadsheetApp.getUi().alert('Hoja Usuarios creada.\nadmin / admin123\nvendedor / 1234');
  } else {
    SpreadsheetApp.getUi().alert('La hoja Usuarios ya existe.');
  }
}
