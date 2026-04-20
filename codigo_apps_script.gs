function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'addVentas') {
      const sheet = ss.getSheetByName('Respuestas formulario');
      data.ventas.forEach(v => {
        sheet.appendRow([v.fecha, v.codigo, v.descripcion, v.precio, v.cantidad, v.formaPago, v.turno, v.responsable]);
        const inv   = ss.getSheetByName('Inventario');
        const datos = inv.getDataRange().getValues();
        for (let i = 2; i < datos.length; i++) {
          if (String(datos[i][0]).trim() === String(v.codigo).trim()) {
            inv.getRange(i + 1, 3).setValue(Math.max(0, (parseFloat(datos[i][2]) || 0) - v.cantidad));
            break;
          }
        }
      });
      return buildResponse({ status: 'ok' });
    }

    if (data.action === 'login') {
      const sheet = ss.getSheetByName('Usuarios');
      if (!sheet) return buildResponse({ status: 'error', message: 'Hoja Usuarios no existe. Ejecutá setupUsuarios() en Apps Script.' });
      const rows = sheet.getDataRange().getValues();
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]).trim().toLowerCase() === data.usuario.trim().toLowerCase()
            && String(rows[i][1]).trim() === data.password.trim()) {
          return buildResponse({ status: 'ok', usuario: String(rows[i][0]).trim(), rol: String(rows[i][2]).trim().toLowerCase() });
        }
      }
      return buildResponse({ status: 'error', message: 'Usuario o contraseña incorrectos' });
    }

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

    if (data.action === 'addProducto') {
      const inv = ss.getSheetByName('Inventario');
      inv.appendRow([data.codigo.trim(), data.descripcion.trim(), parseFloat(data.stock), parseFloat(data.precio)]);
      return buildResponse({ status: 'ok' });
    }

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

    return buildResponse({ status: 'error', message: 'Acción desconocida' });
  } catch(err) {
    return buildResponse({ status: 'error', message: err.message });
  }
}

function doGet(e) {
  return buildResponse({ status: 'ok', message: 'API activa' });
}

function buildResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Ejecutá esta función UNA VEZ desde el editor de Apps Script para crear la hoja Usuarios
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
