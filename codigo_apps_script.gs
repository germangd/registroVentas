// ── PEGÁ ESTE CÓDIGO EN GOOGLE APPS SCRIPT ────────────────
// (instrucciones completas en LEEME.txt)

function doPost(e) {
  try {
    const data   = JSON.parse(e.postData.contents);
    const ss     = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === 'addVentas') {
      const sheet = ss.getSheetByName('Respuestas formulario');
      data.ventas.forEach(v => {
        sheet.appendRow([
          v.fecha, v.codigo, v.descripcion,
          v.precio, v.cantidad, v.subtotal,
          v.turno, v.responsable, v.formaPago
        ]);
        // Actualizar stock en Inventario
        const inv   = ss.getSheetByName('Inventario');
        const datos = inv.getDataRange().getValues();
        for (let i = 1; i < datos.length; i++) {
          if (String(datos[i][0]) === String(v.codigo)) {
            const stockActual = datos[i][2];
            inv.getRange(i + 1, 3).setValue(Math.max(0, stockActual - v.cantidad));
            break;
          }
        }
      });
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'API activa' }))
    .setMimeType(ContentService.MimeType.JSON);
}
