import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server-auth'

/**
 * MONITORING GANGGUAN SERVER (Task 34 — Always-On 24/7).
 *
 * POST  — dipanggil MONITOR EKSTERNAL (scheduler luar) HANYA saat status
 *         BERUBAH: server turun ('down') atau kembali naik ('up').
 *         Diamankan dengan header x-monitor-key (env HEALTH_MONITOR_KEY).
 *         Write DB hanya terjadi saat pergantian status — bukan tiap ping —
 *         sehingga kuota Supabase tidak terbakar oleh keep-alive.
 * GET   — admin: riwayat incident (50 terakhir) + incident yang masih terbuka.
 * DELETE— admin: hapus 1 incident (mis. false-positive saat pengujian).
 *
 * Saat 'down'/'up': broadcast Notification tipe 'system' (userId '' =
 * broadcast admin) — peringatan Super Admin langsung muncul di lonceng
 * notifikasi + popup realtime, tanpa request DB tambahan rutin.
 */

function checkMonitorKey(request: NextRequest): boolean {
  const key = process.env.HEALTH_MONITOR_KEY || ''
  if (!key) return false // belum diset → API monitor nonaktif (fail-closed)
  const provided = request.headers.get('x-monitor-key') || ''
  return provided === key
}

export async function POST(request: NextRequest) {
  if (!checkMonitorKey(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const event = body?.event === 'down' || body?.event === 'up' ? body.event : null
    if (!event) {
      return NextResponse.json({ ok: false, error: 'body.event wajib "down" | "up"' }, { status: 400 })
    }
    const detail = typeof body?.detail === 'string' ? body.detail.slice(0, 500) : ''
    const now = new Date()
    const startedAt =
      body?.startedAt && !Number.isNaN(new Date(body.startedAt).getTime())
        ? new Date(body.startedAt)
        : now

    // Incident masih terbuka (recoveredAt null) — paling baru dulu.
    const open = await db.serverIncident.findFirst({
      where: { recoveredAt: null },
      orderBy: { startedAt: 'desc' },
    })

    if (event === 'down') {
      if (open) {
        // Incident sudah tercatat & belum pulih → JANGAN duplikasi (hemat kuota).
        return NextResponse.json({ ok: true, deduped: true, incidentId: open.id })
      }
      const created = await db.serverIncident.create({
        data: { startedAt, recoveredAt: null, source: 'external-monitor', detail },
      })
      await db.notification
        .create({
          data: {
            userId: '', // broadcast admin
            title: 'Server Darrellsoft Bermasalah',
            body: `Aplikasi terdeteksi tidak dapat diakses sejak ${startedAt.toLocaleString('id-ID')}${detail ? ` — ${detail}` : ''}. Monitoring sedang memantau pemulihan.`,
            type: 'system',
            link: '/panel-admin?tab=perangkat',
          },
        })
        .catch(() => {})
      return NextResponse.json({ ok: true, incidentId: created.id, state: 'down-recorded' })
    }

    // event === 'up' → tutup incident terbuka (bila ada) + notifikasi pulih.
    if (!open) {
      return NextResponse.json({ ok: true, deduped: true, state: 'no-open-incident' })
    }
    await db.serverIncident.update({
      where: { id: open.id },
      data: { recoveredAt: now },
    })
    await db.notification
      .create({
        data: {
          userId: '',
          title: 'Server Darrellsoft Kembali Online',
          body: `Gangguan sejak ${open.startedAt.toLocaleString('id-ID')} telah pulih pada ${now.toLocaleString('id-ID')} (durasi ${Math.max(1, Math.round((now.getTime() - open.startedAt.getTime()) / 60000))} menit).`,
          type: 'system',
          link: '/panel-admin?tab=perangkat',
        },
      })
      .catch(() => {})
    return NextResponse.json({ ok: true, incidentId: open.id, state: 'recovered' })
  } catch (error) {
    console.error('monitor-events POST error:', error)
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const [incidents, open] = await Promise.all([
      db.serverIncident.findMany({ orderBy: { startedAt: 'desc' }, take: 50 }),
      db.serverIncident.findFirst({ where: { recoveredAt: null }, orderBy: { startedAt: 'desc' } }),
    ])
    return NextResponse.json(
      { ok: true, incidents, open },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    // Tabel belum ada (baru di-push) → fail-soft agar kartu status tetap hidup.
    console.error('monitor-events GET error:', error)
    return NextResponse.json({ ok: true, incidents: [], open: null })
  }
}

export async function DELETE(request: NextRequest) {
  const err = requireAdmin(request)
  if (err) return err
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id') || ''
    if (!id) return NextResponse.json({ ok: false, error: 'id wajib' }, { status: 400 })
    await db.serverIncident.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('monitor-events DELETE error:', error)
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
}
