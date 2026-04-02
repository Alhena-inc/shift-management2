// LINE Messaging API - Push notification for procedure approvals

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push'

interface NotificationPayload {
  lineUserId: string
  title: string
  body: string
  actionUrl?: string
}

export async function sendLineNotification({ lineUserId, title, body, actionUrl }: NotificationPayload) {
  const messages: any[] = []

  if (actionUrl) {
    // Flex Message with action button
    messages.push({
      type: 'flex',
      altText: `${title}: ${body}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#1B6B4A',
          paddingAll: '16px',
          contents: [
            {
              type: 'text',
              text: 'のあスタッフポータル',
              color: '#FFFFFF',
              size: 'xs',
              weight: 'bold',
            },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          paddingAll: '16px',
          contents: [
            {
              type: 'text',
              text: title,
              weight: 'bold',
              size: 'md',
              wrap: true,
            },
            {
              type: 'text',
              text: body,
              size: 'sm',
              color: '#666666',
              wrap: true,
            },
          ],
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: '16px',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '確認する',
                uri: actionUrl,
              },
              style: 'primary',
              color: '#1B6B4A',
            },
          ],
        },
      },
    })
  } else {
    messages.push({
      type: 'text',
      text: `【のあスタッフポータル】\n${title}\n\n${body}`,
    })
  }

  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      to: lineUserId,
      messages,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    console.error('LINE notification failed:', error)
    throw new Error(`LINE notification failed: ${error}`)
  }

  return true
}

// Convenience: notify coordinator about new procedure submission
export async function notifyProcedureSubmission(params: {
  coordinatorLineId: string
  procedureTitle: string
  clientName: string
  authorName: string
  procedureUrl: string
}) {
  return sendLineNotification({
    lineUserId: params.coordinatorLineId,
    title: '📋 手順書の承認依頼',
    body: `${params.authorName}さんが「${params.clientName}」の手順書「${params.procedureTitle}」を提出しました。確認・承認をお願いします。`,
    actionUrl: params.procedureUrl,
  })
}

// Convenience: notify helper about approval result
export async function notifyProcedureResult(params: {
  helperLineId: string
  procedureTitle: string
  clientName: string
  approved: boolean
  reason?: string
  procedureUrl: string
}) {
  const status = params.approved ? '✅ 承認されました' : '❌ 差し戻しされました'
  const body = params.approved
    ? `手順書「${params.procedureTitle}」（${params.clientName}）が承認され、本番手順書として反映されました。`
    : `手順書「${params.procedureTitle}」（${params.clientName}）が差し戻されました。\n理由: ${params.reason || '（理由なし）'}`

  return sendLineNotification({
    lineUserId: params.helperLineId,
    title: status,
    body,
    actionUrl: params.procedureUrl,
  })
}
