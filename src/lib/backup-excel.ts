import ExcelJS from 'exceljs'

/** Column definition for print-style Excel */
export interface PrintColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  width?: number
}

/**
 * Create a print-style formatted Excel workbook.
 * Sheet 1 "Laporan" — formatted like the print preview (title, date, numbered table, footer)
 * Sheet 2 "Data"   — raw database columns for restore compatibility
 * Sheet 3 "Info"   — metadata
 */
export async function createPrintStyleExcel(
  title: string,
  columns: PrintColumn[],
  data: Record<string, any>[],
  rawData: Record<string, any>[],
  metadata?: { type: string; table: string; tableName: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'DarrellSoft'
  workbook.created = new Date()

  // ============== Sheet 1: Laporan (formatted print view) ==============
  const reportSheet = workbook.addWorksheet('Laporan', {
    properties: { tabColor: { argb: 'FF10B981' } },
  })

  const totalCols = columns.length + 1 // +1 for "No" column

  // Title row (merged across all columns)
  const titleRow = reportSheet.addRow([title])
  titleRow.font = { bold: true, size: 16, color: { argb: 'FF1F2937' } }
  titleRow.alignment = { horizontal: 'center', vertical: 'middle' }
  titleRow.height = 36
  reportSheet.mergeCells(1, 1, 1, totalCols)

  // Timestamp row
  const dateRow = reportSheet.addRow([`Dicetak: ${new Date().toLocaleString('id-ID')}`])
  dateRow.font = { size: 10, color: { argb: 'FF6B7280' } }
  dateRow.alignment = { horizontal: 'right' }
  reportSheet.mergeCells(2, 1, 2, totalCols)

  // Empty spacer row
  reportSheet.addRow([])

  // Header row
  const headerLabels = ['No', ...columns.map((c) => c.label)]
  const headerRow = reportSheet.addRow(headerLabels)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF374151' },
  }
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
  headerRow.height = 26
  // Add thin borders to header cells
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
    }
  })

  // Data rows
  data.forEach((row, idx) => {
    const values = [
      idx + 1,
      ...columns.map((col) => {
        const val = row[col.key]
        if (val === null || val === undefined) return '-'
        if (typeof val === 'number') return val
        return String(val)
      }),
    ]
    const dataRow = reportSheet.addRow(values)

    // Alignment per column
    dataRow.getCell(1).alignment = { horizontal: 'center' } // No column
    columns.forEach((col, ci) => {
      const align = col.align || 'left'
      dataRow.getCell(ci + 2).alignment = { horizontal: align }
    })

    // Alternating row colors
    if (idx % 2 === 1) {
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' },
      }
    }

    // Borders
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
    })
  })

  // Empty row then footer
  reportSheet.addRow([])
  const footerRow = reportSheet.addRow([`Total Data: ${data.length}`])
  footerRow.font = { size: 10, color: { argb: 'FF6B7280' }, italic: true }
  footerRow.alignment = { horizontal: 'center' }
  reportSheet.mergeCells(footerRow.number, 1, footerRow.number, totalCols)

  // Set column widths
  reportSheet.getColumn(1).width = 6 // No column
  columns.forEach((col, ci) => {
    const colWidth = col.width || 18
    reportSheet.getColumn(ci + 2).width = colWidth
  })

  // Protect the Laporan sheet
  await reportSheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  })

  // ============== Sheet 2: Data (raw database columns for restore) ==============
  const dataSheet = workbook.addWorksheet('Data', {
    properties: { tabColor: { argb: 'FF6B7280' } },
  })

  if (rawData.length === 0) {
    dataSheet.addRow(['(Tidak ada data)'])
  } else {
    const allKeys = new Set<string>()
    rawData.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)))
    const headers = Array.from(allKeys)

    // Header row
    const rawHeaderRow = dataSheet.addRow(headers)
    rawHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    rawHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF374151' },
    }
    rawHeaderRow.alignment = { horizontal: 'center', vertical: 'middle' }
    rawHeaderRow.height = 24

    // Data rows
    rawData.forEach((row) => {
      const values = headers.map((key) => {
        const val = row[key]
        if (val === null || val === undefined) return ''
        if (val instanceof Date) return val.toISOString()
        if (typeof val === 'object') return JSON.stringify(val)
        return val
      })
      dataSheet.addRow(values)
    })

    // Auto-fit column widths
    headers.forEach((header, i) => {
      const col = dataSheet.getColumn(i + 1)
      let maxLen = header.length
      rawData.forEach((row) => {
        const val = row[header]
        const str = val === null || val === undefined ? '' : String(val)
        maxLen = Math.max(maxLen, str.length)
      })
      col.width = Math.min(Math.max(maxLen + 2, 10), 50)
    })

    // Alternating row colors
    dataSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        }
      }
    })
  }

  // Protect Data sheet too
  await dataSheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  })

  // ============== Sheet 3: Info (metadata) ==============
  if (metadata) {
    const metaSheet = workbook.addWorksheet('Info', {
      properties: { tabColor: { argb: 'FF9CA3AF' } },
    })
    metaSheet.addRow(['Key', 'Value'])
    metaSheet.addRow(['Type', metadata.type])
    metaSheet.addRow(['Table', metadata.table])
    metaSheet.addRow(['Table Name', metadata.tableName])
    metaSheet.addRow(['Timestamp', new Date().toISOString()])
    metaSheet.addRow(['Record Count', rawData.length])
    metaSheet.getRow(1).font = { bold: true }
    metaSheet.getColumn(1).width = 18
    metaSheet.getColumn(2).width = 30
    await metaSheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    })
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Create a protected (read-only) Excel workbook from data array.
 * - First row = headers
 * - Subsequent rows = data values
 * - Sheet is password-protected so cells cannot be edited
 * 
 * @deprecated Use createPrintStyleExcel for new code
 */
export async function createProtectedExcel(
  sheetName: string,
  data: Record<string, any>[],
  metadata?: { type: string; table: string; tableName: string }
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'DarrellSoft'
  workbook.created = new Date()

  // Metadata sheet
  if (metadata) {
    const metaSheet = workbook.addWorksheet('Info', {
      properties: { tabColor: { argb: 'FF6B7280' } },
    })
    metaSheet.addRow(['Key', 'Value'])
    metaSheet.addRow(['Type', metadata.type])
    metaSheet.addRow(['Table', metadata.table])
    metaSheet.addRow(['Table Name', metadata.tableName])
    metaSheet.addRow(['Timestamp', new Date().toISOString()])
    metaSheet.addRow(['Record Count', data.length])
    metaSheet.getRow(1).font = { bold: true }
    metaSheet.getColumn(1).width = 18
    metaSheet.getColumn(2).width = 30
    // Protect metadata sheet too
    await metaSheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    })
  }

  // Data sheet
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: 'FF10B981' } },
  })

  if (data.length === 0) {
    sheet.addRow(['(Tidak ada data)'])
  } else {
    // Get all unique keys from all records
    const allKeys = new Set<string>()
    data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)))
    const headers = Array.from(allKeys)

    // Header row with styling
    const headerRow = sheet.addRow(headers)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF374151' },
    }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 24

    // Data rows
    data.forEach((row) => {
      const values = headers.map((key) => {
        const val = row[key]
        if (val === null || val === undefined) return ''
        if (val instanceof Date) return val.toISOString()
        if (typeof val === 'object') return JSON.stringify(val)
        return val
      })
      sheet.addRow(values)
    })

    // Auto-fit column widths
    headers.forEach((header, i) => {
      const col = sheet.getColumn(i + 1)
      let maxLen = header.length
      data.forEach((row) => {
        const val = row[header]
        const str = val === null || val === undefined ? '' : String(val)
        maxLen = Math.max(maxLen, str.length)
      })
      col.width = Math.min(Math.max(maxLen + 2, 10), 50)
    })

    // Alternating row colors
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        }
      }
    })
  }

  // Protect the sheet (no password needed to open, but can't edit)
  await sheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertColumns: false,
    insertRows: false,
    insertHyperlinks: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
    pivotTables: false,
  })

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

/**
 * Parse an Excel file and return the data as an array of objects.
 * Reads from the "Data" sheet (for print-style exports) or first non-Info/Laporan sheet.
 * Uses the Info sheet for metadata.
 */
export async function parseBackupExcel(
  fileBuffer: Buffer
): Promise<{ data: Record<string, any>[]; metadata?: { type: string; table: string; tableName: string } }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(fileBuffer)

  let metadata: { type: string; table: string; tableName: string } | undefined

  // Try to read metadata from Info sheet
  const metaSheet = workbook.worksheets.find((s) => s.name === 'Info')
  if (metaSheet) {
    const metaRows: Record<string, string> = {}
    metaSheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const key = row.getCell(1).text
        const value = row.getCell(2).text
        metaRows[key] = value
      }
    })
    if (metaRows['Type'] && metaRows['Table']) {
      metadata = {
        type: metaRows['Type'],
        table: metaRows['Table'],
        tableName: metaRows['Table Name'] || metaRows['Table'],
      }
    }
  }

  // Read data from the "Data" sheet first (print-style exports), 
  // then fall back to first non-Info, non-Laporan sheet
  const dataSheet = workbook.worksheets.find((s) => s.name === 'Data')
    || workbook.worksheets.find((s) => s.name !== 'Info' && s.name !== 'Laporan')
  if (!dataSheet) {
    return { data: [], metadata }
  }

  const data: Record<string, any>[] = []
  let headers: string[] = []

  dataSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      // Header row
      headers = []
      row.eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.text
      })
    } else if (headers.length > 0) {
      const record: Record<string, any> = {}
      row.eachCell((cell, colNumber) => {
        const key = headers[colNumber - 1]
        if (key) {
          let value: any = cell.text
          // Try to parse numbers
          if (value !== '' && !isNaN(Number(value)) && cell.type === ExcelJS.ValueType.Number) {
            value = Number(value)
          }
          record[key] = value
        }
      })
      // Skip empty rows
      if (Object.keys(record).length > 0 && !(Object.values(record).every((v) => v === ''))) {
        data.push(record)
      }
    }
  })

  return { data, metadata }
}
