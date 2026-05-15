import ExcelJS from 'exceljs'

/**
 * Create a protected (read-only) Excel workbook from data array.
 * - First row = headers
 * - Subsequent rows = data values
 * - Sheet is password-protected so cells cannot be edited
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
 * Reads from the data sheet (second sheet), uses the Info sheet for metadata.
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

  // Read data from the data sheet (first non-Info sheet)
  const dataSheet = workbook.worksheets.find((s) => s.name !== 'Info')
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
