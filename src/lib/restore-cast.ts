/**
 * Schema-driven caster untuk restore data backup (Excel/JSON) → Prisma createMany.
 *
 * Latar belakang bug ("Gagal melakukan restore database: Data tidak valid.
 * Periksa kembali input Anda."):
 * - ExcelJS mengembalikan sel boolean sebagai TEKS "true"/"false" → Prisma menolak string
 *   untuk field Boolean (PrismaClientValidationError). Tabel Customer (tabel pertama yang
 *   di-restore) punya isActive Boolean → restore selalu gagal di baris pertama.
 * - Angka dari sel Excel berupa number, sedangkan banyak kolom schema bertipe String.
 * - Backup dari versi aplikasi lain bisa berisi kolom yang tidak ada di schema saat ini →
 *   PrismaClientValidationError "Unknown argument".
 * - Backup lama bisa kehilangan field wajib tanpa default → "Argument ... is missing".
 *
 * Solusi: cast berdasarkan metadata model Prisma (DMMF) — hanya field scalar yang dikirim,
 * tipe dikonversi dengan benar, kolom asing dibuang, field wajib yang hilang diisi netral.
 */

import { Prisma } from '@prisma/client'

interface ScalarFieldMeta {
  name: string
  type: string
  isRequired: boolean
  hasDefault: boolean
}

const modelFieldsCache = new Map<string, Map<string, ScalarFieldMeta>>()

/** Ambil metadata field scalar sebuah model dari Prisma DMMF (di-cache per proses). */
function scalarFieldsOfModel(modelName: string): Map<string, ScalarFieldMeta> | null {
  const cached = modelFieldsCache.get(modelName)
  if (cached) return cached
  try {
    const models = (
      Prisma as unknown as {
        dmmf?: {
          datamodel?: {
            models?: Array<{
              name: string
              fields: Array<{
                name: string
                kind: string
                type: string
                isRequired?: boolean
                hasDefaultValue?: boolean
              }>
            }>
          }
        }
      }
    ).dmmf?.datamodel?.models
    const model = models?.find((m) => m.name === modelName)
    if (!model) return null
    const map = new Map<string, ScalarFieldMeta>()
    for (const f of model.fields) {
      if (f.kind !== 'scalar') continue // field relasi (object) dilewati — scalar FK tetap dipakai
      map.set(f.name, {
        name: f.name,
        type: f.type,
        isRequired: !!f.isRequired,
        hasDefault: !!f.hasDefaultValue,
      })
    }
    modelFieldsCache.set(modelName, map)
    return map
  } catch {
    return null
  }
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

/** Nilai netral untuk field wajib tanpa default yang hilang di backup (mis. kolom baru pada backup lama). */
function neutralValueFor(type: string): unknown {
  if (type === 'Int' || type === 'BigInt' || type === 'Float' || type === 'Decimal') return 0
  if (type === 'Boolean') return false
  if (type === 'DateTime') return new Date().toISOString()
  return ''
}

function parseBoolean(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toLowerCase()
  if (s === 'true' || s === '1' || s === 'yes' || s === 'ya') return true
  if (s === 'false' || s === '0' || s === 'no' || s === 'tidak') return false
  return undefined
}

/**
 * Cast satu baris backup mengikuti schema model Prisma.
 * - Kolom yang tidak dikenal schema DIBUANG (bukan error) — aman untuk backup lintas versi.
 * - `id` selalu dibuang — Prisma membuat id baru saat restore.
 * - Boolean/Int/Float/DateTime di-cast ke tipe yang benar; angka untuk field String di-String-kan.
 * - Field wajib tanpa default yang hilang diisi nilai netral agar createMany tidak gagal.
 * - Field opsional yang kosong dilewati (NULL).
 */
export function castRowBySchema(
  row: Record<string, unknown>,
  modelName: string,
  opts: { skipFields?: string[] } = {}
): Record<string, unknown> {
  const fields = scalarFieldsOfModel(modelName)
  // Model tidak dikenal DMMF → fallback pass-through (minus id) agar tidak kehilangan data
  if (!fields) {
    const out: Record<string, unknown> = { ...row }
    delete out.id
    return out
  }

  const skip = new Set(opts.skipFields || [])
  const out: Record<string, unknown> = {}

  for (const meta of fields.values()) {
    if (meta.name === 'id' || skip.has(meta.name)) continue
    const raw = row[meta.name]

    if (isBlank(raw)) {
      if (meta.isRequired) {
        if (meta.hasDefault) continue // biarkan Prisma memakai default schema
        out[meta.name] = neutralValueFor(meta.type)
      }
      continue // field opsional kosong → NULL
    }

    switch (meta.type) {
      case 'String':
        out[meta.name] = typeof raw === 'string' ? raw : String(raw)
        break
      case 'Int':
      case 'BigInt': {
        const n = Number(raw)
        if (Number.isFinite(n)) out[meta.name] = Math.round(n)
        else if (meta.isRequired) out[meta.name] = 0
        break
      }
      case 'Float':
      case 'Decimal': {
        const n = Number(raw)
        if (Number.isFinite(n)) out[meta.name] = n
        else if (meta.isRequired) out[meta.name] = 0
        break
      }
      case 'Boolean': {
        const b = parseBoolean(raw)
        if (b !== undefined) out[meta.name] = b
        else if (meta.isRequired) out[meta.name] = false
        break
      }
      case 'DateTime': {
        const d = raw instanceof Date ? raw : new Date(String(raw))
        if (!Number.isNaN(d.getTime())) out[meta.name] = d.toISOString()
        else if (meta.isRequired) out[meta.name] = neutralValueFor('DateTime')
        break
      }
      default:
        break // tipe tak dikenal → jangan kirim field ini
    }
  }

  return out
}
