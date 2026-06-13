import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Next.js 16 renamed `middleware` → `proxy`. Runs before every matched request.
// Two jobs:
//   1) Refresh the Supabase auth session on ALL routes (rotates the access token
//      and writes the updated cookies back — Server Components can't do this).
//   2) Gate /admin/* routes behind the admin role.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() triggers the token refresh. Keep it directly after
  // createServerClient — code in between can cause intermittent logouts.
  const { data: { user } } = await supabase.auth.getUser()

  // ── Admin route protection ──────────────────────────────────────────
  const path = request.nextUrl.pathname
  if (path.startsWith('/admin')) {
    const isAdmin = user?.app_metadata?.role === 'admin'

    if (path.startsWith('/admin/login')) {
      // Already an admin → skip the login page
      if (isAdmin) return NextResponse.redirect(new URL('/admin', request.url))
      return response
    }

    // Any other /admin/* route requires the admin role
    if (!isAdmin) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Minden útvonalra fut, KIVÉVE a statikus tartalom:
     * - _next/static, _next/image (build assetek)
     * - favicon és képfájlok
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
