import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import ClientDetailView from '@/components/client/ClientDetailView'

interface Props {
  params: { id: string }
}

export default async function ClientDetailPage({ params }: Props) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/')

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!client) notFound()

  // Fetch emergency contacts
  const { data: emergencyContacts } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('client_id', params.id)
    .order('sort_order')

  // Fetch active assessment
  const { data: assessment } = await supabase
    .from('assessments')
    .select('*')
    .eq('client_id', params.id)
    .eq('status', 'active')
    .order('assessed_date', { ascending: false })
    .limit(1)
    .single()

  // Fetch procedures
  const { data: procedures } = await supabase
    .from('procedures')
    .select(`
      *,
      procedure_items(*)
    `)
    .eq('client_id', params.id)
    .or(
      profile.role === 'helper'
        ? `status.eq.approved,created_by.eq.${user.id}`
        : 'status.neq.placeholder'
    )
    .order('created_at', { ascending: false })

  // Fetch weekly schedule
  const { data: weeklySchedule } = await supabase
    .from('weekly_schedules')
    .select('*')
    .eq('client_id', params.id)
    .order('day_of_week')
    .order('start_time')

  return (
    <ClientDetailView
      client={client}
      emergencyContacts={emergencyContacts || []}
      assessment={assessment}
      procedures={(procedures || []).map((p: any) => ({
        ...p,
        items: (p.procedure_items || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      }))}
      weeklySchedule={weeklySchedule || []}
      role={profile.role}
      userId={user.id}
    />
  )
}
