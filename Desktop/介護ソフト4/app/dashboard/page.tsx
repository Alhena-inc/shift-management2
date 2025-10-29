import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, Calendar, Clock } from "lucide-react";

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ページタイトル */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight">ダッシュボード</h2>
          <p className="text-muted-foreground">システムの概要と最新のアラートを確認できます</p>
        </div>

        {/* 統計カード */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">登録利用者数</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">25</div>
              <p className="text-xs text-muted-foreground">前月比 +2名</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">登録ヘルパー数</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">25</div>
              <p className="text-xs text-muted-foreground">稼働中: 23名</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">本日の訪問件数</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-muted-foreground">完了: 8件</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">今月の総訪問時間</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">245.5</div>
              <p className="text-xs text-muted-foreground">時間</p>
            </CardContent>
          </Card>
        </div>

        {/* アラート掲示板 */}
        <Card>
          <CardHeader>
            <CardTitle>アラート掲示板</CardTitle>
            <CardDescription>期限が近づいている書類や更新が必要な情報</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center p-3 border border-red-200 bg-red-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">山田太郎さん - 受給者証</p>
                  <p className="text-xs text-red-700">期限: 2025-11-01（3日後）</p>
                </div>
              </div>
              <div className="flex items-center p-3 border border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">鈴木花子さん - モニタリング</p>
                  <p className="text-xs text-amber-700">期限: 2025-11-05（7日後）</p>
                </div>
              </div>
              <div className="flex items-center p-3 border border-blue-200 bg-blue-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">佐藤次郎さん - 個別支援計画</p>
                  <p className="text-xs text-blue-700">期限: 2025-11-10（12日後）</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 本日のケア内容 */}
        <Card>
          <CardHeader>
            <CardTitle>本日のケア内容</CardTitle>
            <CardDescription>あなたの本日のスケジュール</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">09:00 - 11:00</p>
                  <p className="text-sm text-muted-foreground">山田太郎さん - 居宅介護</p>
                  <p className="text-xs text-muted-foreground">東京都渋谷区...</p>
                </div>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">完了</span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">13:00 - 15:00</p>
                  <p className="text-sm text-muted-foreground">鈴木花子さん - 重度訪問介護</p>
                  <p className="text-xs text-muted-foreground">東京都新宿区...</p>
                </div>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">予定</span>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">16:00 - 18:00</p>
                  <p className="text-sm text-muted-foreground">佐藤次郎さん - 移動支援</p>
                  <p className="text-xs text-muted-foreground">東京都世田谷区...</p>
                </div>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">予定</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}