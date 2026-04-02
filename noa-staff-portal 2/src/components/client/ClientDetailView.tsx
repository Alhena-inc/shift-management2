'use client'

import { useState } from 'react'
import Header from '@/components/ui/Header'
import TabBar from '@/components/ui/TabBar'
import BasicInfoTab from '@/components/client/BasicInfoTab'
import AssessmentTab from '@/components/assessment/AssessmentTab'
import ProcedureTab from '@/components/procedure/ProcedureTab'
import type { Client, EmergencyContact, Assessment, UserRole, WeeklySchedule } from '@/types/database'
import type { ProcedureWithItems } from '@/types/database'

interface Props {
  client: Client
  emergencyContacts: EmergencyContact[]
  assessment: Assessment | null
  procedures: ProcedureWithItems[]
  weeklySchedule: WeeklySchedule[]
  role: UserRole
  userId: string
}

const TABS = [
  { key: 'basic', label: '基本情報', icon: '📋' },
  { key: 'assess', label: 'アセスメント', icon: '📝' },
  { key: 'proc', label: '手順書', icon: '📖' },
]

export default function ClientDetailView({
  client, emergencyContacts, assessment, procedures, weeklySchedule, role, userId,
}: Props) {
  const [tab, setTab] = useState('basic')

  return (
    <>
      <Header title={client.name} showBack />

      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white text-center px-4 py-5 pb-6">
        <h2 className="text-[22px] font-bold mb-1">{client.name}</h2>
        <p className="text-sm opacity-85">
          {client.age && `${client.age}歳`}
          {client.support_category && ` ・ ${client.support_category}`}
          {client.service_type && ` ・ ${client.service_type}`}
        </p>
      </div>

      <TabBar tabs={TABS} selected={tab} onChange={setTab} />

      {tab === 'basic' && (
        <BasicInfoTab
          client={client}
          emergencyContacts={emergencyContacts}
        />
      )}
      {tab === 'assess' && (
        <AssessmentTab assessment={assessment} />
      )}
      {tab === 'proc' && (
        <ProcedureTab
          procedures={procedures}
          clientId={client.id}
          role={role}
          userId={userId}
        />
      )}
    </>
  )
}
