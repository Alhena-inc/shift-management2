import InfoGroup, { InfoRow, PhoneLink, DiseaseTag, ServiceBadge } from '@/components/ui/InfoGroup'
import type { Client, EmergencyContact } from '@/types/database'

interface Props {
  client: Client
  emergencyContacts: EmergencyContact[]
}

export default function BasicInfoTab({ client, emergencyContacts }: Props) {
  return (
    <div className="p-4">
      {/* 利用者情報 */}
      <InfoGroup title="利用者情報" icon="👤">
        <InfoRow label="氏名">{client.name}</InfoRow>
        {client.furigana && <InfoRow label="フリガナ">{client.furigana}</InfoRow>}
        {client.age != null && <InfoRow label="年齢">{client.age}歳</InfoRow>}
        {client.gender && <InfoRow label="性別">{client.gender}</InfoRow>}
        {client.birth_date && <InfoRow label="生年月日">{client.birth_date}</InfoRow>}
        {client.address && <InfoRow label="住所">{client.address}</InfoRow>}
        {client.phone && (
          <InfoRow label="電話番号"><PhoneLink number={client.phone} /></InfoRow>
        )}
        {client.housing_type && <InfoRow label="住居形態">{client.housing_type}</InfoRow>}
      </InfoGroup>

      {/* 障がい・医療 */}
      <InfoGroup title="障がい・医療情報" icon="🏥">
        {client.disease_name && (
          <InfoRow label="疾患名">
            {client.disease_name.split(',').map((d, i) => (
              <DiseaseTag key={i} name={d.trim()} />
            ))}
          </InfoRow>
        )}
        {client.disability_type && <InfoRow label="障がい種別">{client.disability_type}</InfoRow>}
        {client.disability_grade && <InfoRow label="等級">{client.disability_grade}</InfoRow>}
        {client.support_category && <InfoRow label="障害支援区分">{client.support_category}</InfoRow>}
        {client.service_type && (
          <InfoRow label="サービス種別"><ServiceBadge type={client.service_type} /></InfoRow>
        )}
      </InfoGroup>

      {/* 家族構成 */}
      <InfoGroup title="家族構成" icon="👨‍👩‍👧‍👦">
        {client.family_structure && <InfoRow label="家族構成">{client.family_structure}</InfoRow>}
        {client.primary_caregiver && <InfoRow label="主たる介護者">{client.primary_caregiver}</InfoRow>}
        {client.social_relations && <InfoRow label="社会関係">{client.social_relations}</InfoRow>}
      </InfoGroup>

      {/* 緊急連絡先 */}
      {emergencyContacts.length > 0 && (
        <InfoGroup title="緊急連絡先" icon="📞">
          {emergencyContacts.map((ec, i) => (
            <InfoRow key={ec.id} label={`${ec.relationship || '連絡先'}${i + 1}`}>
              <div>
                <div className="mb-1">{ec.name}{ec.relationship && `（${ec.relationship}）`}</div>
                <PhoneLink number={ec.phone} />
              </div>
            </InfoRow>
          ))}
        </InfoGroup>
      )}

      {/* 本人・家族の意向 */}
      {(client.client_wishes || client.family_wishes) && (
        <InfoGroup title="本人・家族の意向" icon="⭐">
          {client.client_wishes && <InfoRow label="本人の希望">{client.client_wishes}</InfoRow>}
          {client.family_wishes && <InfoRow label="家族の希望">{client.family_wishes}</InfoRow>}
          {client.desired_living && <InfoRow label="希望する暮らし">{client.desired_living}</InfoRow>}
        </InfoGroup>
      )}
    </div>
  )
}
