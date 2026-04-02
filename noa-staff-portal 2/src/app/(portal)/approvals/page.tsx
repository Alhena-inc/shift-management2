import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ApprovalListView from '@/components/procedure/ApprovalListView'

export default async function ApprovalsPage() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role === 'helper') redirect('/clients')

  // Fetch pending approval requests
  const { data: requests } = await supabase
    .from('approval_requests')
    .select(`
      *,
      procedures:procedure_id(
        *,
        procedure_items(*),
        clients:client_id(name),
        creator:created_by(display_name)
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <ApprovalListView
      requests={requests || []}
      userId={user.id}
    />
  )
}
