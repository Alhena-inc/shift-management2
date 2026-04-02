import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ClientListView from '@/components/client/ClientListView'

export default async function ClientsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Get user profile with role
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/')

  // Fetch clients based on role
  let clients
  if (profile.role === 'helper') {
    // Helper: only assigned clients
    const { data } = await supabase
      .from('clients')
      .select(`
        *,
        client_staff_assignments!inner(staff_id)
      `)
      .eq('client_staff_assignments.staff_id', user.id)
      .eq('is_active', true)
      .order('name')

    clients = data || []
  } else {
    // Coordinator/Admin: all clients
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('is_active', true)
      .order('name')

    clients = data || []
  }

  // Get assigned client IDs for the current user
  const { data: assignments } = await supabase
    .from('client_staff_assignments')
    .select('client_id')
    .eq('staff_id', user.id)

  const assignedIds = new Set((assignments || []).map((a) => a.client_id))

  // Pending approval count (for coordinator/admin badge)
  let pendingCount = 0
  if (profile.role !== 'helper') {
    const { count } = await supabase
      .from('approval_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    pendingCount = count || 0
  }

  return (
    <ClientListView
      clients={clients}
      assignedIds={Array.from(assignedIds)}
      role={profile.role}
      displayName={profile.display_name}
      pendingCount={pendingCount}
    />
  )
}
