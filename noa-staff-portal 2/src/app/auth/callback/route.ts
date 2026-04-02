import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken, getLineProfile } from '@/lib/line/auth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/?error=login_failed', request.url))
  }

  try {
    // 1. Exchange code for LINE token
    const { access_token } = await exchangeCodeForToken(code)

    // 2. Get LINE profile
    const profile = await getLineProfile(access_token)

    // 3. Find or create Supabase user
    const supabase = createAdminClient()

    // Check if LINE user already exists in profiles
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('line_user_id', profile.userId)
      .single()

    let userId: string

    if (existingProfile) {
      userId = existingProfile.id
    } else {
      // Create new auth user
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: `${profile.userId}@line.noa-portal.local`,
        email_confirm: true,
        user_metadata: {
          line_user_id: profile.userId,
          display_name: profile.displayName,
          avatar_url: profile.pictureUrl,
        },
      })

      if (authError || !authUser.user) {
        throw new Error('Failed to create user')
      }

      userId = authUser.user.id

      // Create profile (default role: helper)
      await supabase.from('profiles').insert({
        id: userId,
        line_user_id: profile.userId,
        display_name: profile.displayName,
        avatar_url: profile.pictureUrl || null,
        role: 'helper',
      })
    }

    // 4. Create Supabase session
    // Use custom token approach: sign in with the user's email
    const { data: session, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: `${profile.userId}@line.noa-portal.local`,
    })

    if (sessionError || !session) {
      throw new Error('Failed to create session')
    }

    // Redirect to the magic link which will set the session
    const redirectUrl = new URL('/clients', request.url)

    // Create a response that sets the auth cookie
    const response = NextResponse.redirect(session.properties?.hashed_token
      ? new URL(`/auth/confirm?token_hash=${session.properties.hashed_token}&type=magiclink&next=/clients`, request.url)
      : redirectUrl
    )

    return response
  } catch (err) {
    console.error('LINE login error:', err)
    return NextResponse.redirect(new URL('/?error=login_failed', request.url))
  }
}
