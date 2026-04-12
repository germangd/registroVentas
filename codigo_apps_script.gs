function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'addVentas') {
      const sheet = ss.getSheetByName('Respuestas formulario');
      data.ventas.forEach(v => {
        sheet.appendRow([
          v.fecha,
          v.codigo,
          v.descripcion,
          v.precio,
          v.cantidad,
          v.formaPago,
          v.turno,
          v.responsable
        ]);
        const inv   = ss.getSheetByName('Inventario');
        const datos = inv.getDataRange().getValues();
        for (let i = 1; i < datos.length; i++) {
          if (String(datos[i][0]) === String(v.codigo)) {
            const stockActual = parseFloat(datos[i][2]) || 0;
            inv.getRange(i + 1, 3).setValue(Math.max(0, stockActual - v.cantidad));
            break;
          }
        }
      });

      return buildResponse({ status: 'ok' });
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
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}
