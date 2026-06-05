import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

interface InstallPayload {
  tenant: {
    id: string
    business: {
      name: string
      ownerName: string
      location: string
      phone?: string
      email?: string
      website?: string
      tagline?: string
    }
    vertical: string
    channels: Record<string, { enabled: boolean; token?: string; webhookUrl?: string }>
    hours: { preset: string; timezone: string }
    preferences: {
      responseStyle: string
      autoQuote: boolean
      autoBooking: boolean
      reviewAsk: boolean
    }
  }
}

/**
 * POST /api/install
 *
 * Stub endpoint — receives a tenant config from the onboarding wizard and
 * forwards it to the running Penelope instance at PENELOPE_INSTANCE_URL.
 *
 * Will be wired to @penelope/cli programmatic API in a later wave.
 * For now it validates the payload shape and echoes back a 201 with the tenant id.
 */
export async function POST(req: NextRequest) {
  let body: InstallPayload

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant } = body

  if (!tenant?.id || !tenant?.business?.name || !tenant?.vertical) {
    return NextResponse.json(
      { error: 'Missing required fields: tenant.id, tenant.business.name, tenant.vertical' },
      { status: 422 }
    )
  }

  // Forward to a running Penelope instance when PENELOPE_INSTANCE_URL is configured.
  const instanceUrl = process.env.PENELOPE_INSTANCE_URL
  const installSecret = process.env.PENELOPE_INSTALL_SECRET

  if (instanceUrl) {
    try {
      const upstream = await fetch(`${instanceUrl.replace(/\/$/, '')}/api/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(installSecret ? { Authorization: `Bearer ${installSecret}` } : {}),
        },
        body: JSON.stringify(tenant),
      })

      if (!upstream.ok) {
        const text = await upstream.text()
        return NextResponse.json(
          { error: 'Upstream instance rejected the install', upstream: text },
          { status: 502 }
        )
      }

      const data = await upstream.json()
      return NextResponse.json({ ok: true, tenant: data }, { status: 201 })
    } catch (err) {
      return NextResponse.json(
        { error: 'Could not reach Penelope instance', detail: String(err) },
        { status: 503 }
      )
    }
  }

  // No instance URL configured — stub mode: echo the tenant id back.
  return NextResponse.json(
    {
      ok: true,
      stub: true,
      message:
        'Install received. Set PENELOPE_INSTANCE_URL in your deployment to forward to a live instance.',
      tenantId: tenant.id,
    },
    { status: 201 }
  )
}

/**
 * GET /api/install
 * Health probe — confirms the route is reachable.
 */
export async function GET() {
  return NextResponse.json({
    service: '@penelope/onboarding-web',
    endpoint: '/api/install',
    status: 'ok',
    instanceConfigured: Boolean(process.env.PENELOPE_INSTANCE_URL),
  })
}
