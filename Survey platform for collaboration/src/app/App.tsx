import { useState, useEffect } from 'react';
import { LoginPage } from './components/screens/LoginPage';
import { HomePage } from './components/screens/HomePage';
import { AdminDashboard } from './components/screens/AdminDashboard';
import { RiskManagement } from './components/screens/RiskManagement';
import { ContextEditor } from './components/screens/ContextEditor';
import { DepartmentAssignment } from './components/screens/DepartmentAssignment';
import { RespondentRiskList } from './components/screens/RespondentRiskList';
import { SurveyResponse } from './components/screens/SurveyResponse';
import { ResponseReview } from './components/screens/ResponseReview';
import { ResultsSummary } from './components/screens/ResultsSummary';
import { Button } from './components/ui/button';
import { Home, FolderKanban, Users, FileText, ClipboardList, BarChart3, FileCheck, Menu, LogOut, MapPin } from 'lucide-react';
import { seedDatabase } from './lib/seedData';
import { getLocalGovernment } from './data/localGovernments';
import { DemoDataControls } from './components/DemoDataControls';

type Screen = 'home' | 'dashboard' | 'risks' | 'context' | 'assignment' | 'respondent-list' | 'survey' | 'review' | 'results';

const portalToolsUrl =
  import.meta.env.VITE_PORTAL_TOOLS_URL || 'http://127.0.0.1:4173/tools#adaptation-support-tools';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [userRole, setUserRole] = useState<'admin' | 'respondent' | null>(null);
  const [loginRole, setLoginRole] = useState<'admin' | 'respondent' | null>(null); // 실제 로그인 계정 role
  const [localGovId, setLocalGovId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [userDepartment, setUserDepartment] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null); // 선택된 리스크 ID
  const [datasetVersion, setDatasetVersion] = useState(0);

  const localGov = localGovId ? getLocalGovernment(localGovId) : null;

  function handleLogin(govId: string, role: 'admin' | 'respondent', name: string, dept: string) {
    setLocalGovId(govId);
    setUserRole(role);
    setLoginRole(role); // 로그인 시 실제 role 저장
    setUserName(name);
    setUserDepartment(dept);
    setCurrentScreen(role === 'admin' ? 'dashboard' : 'respondent-list');
  }

  function handleSelectRole(role: 'admin' | 'respondent') {
    setUserRole(role);
    setCurrentScreen(role === 'admin' ? 'dashboard' : 'respondent-list');
  }

  function handleLogout() {
    setLocalGovId(null);
    setUserRole(null);
    setLoginRole(null);
    setUserName('');
    setUserDepartment('');
    setCurrentScreen('home');
  }

  function handleDatasetChanged() {
    setDatasetVersion((version) => version + 1);
  }

  useEffect(() => {
    async function init() {
      try {
        await seedDatabase();
      } catch (error) {
        console.error('Seed error:', error);
        // Continue anyway - app will use mock data
      } finally {
        setInitialized(true);
      }
    }
    init();
  }, []);

  const adminMenuItems = [
    { id: 'dashboard' as Screen, label: '대시보드', icon: Home },
    { id: 'risks' as Screen, label: '리스크 관리', icon: FolderKanban },
    { id: 'context' as Screen, label: '현황정보 구성', icon: FileText },
    { id: 'assignment' as Screen, label: '부서 배정', icon: Users },
    { id: 'review' as Screen, label: '응답 결과 검토', icon: BarChart3 },
    { id: 'results' as Screen, label: '결과 요약', icon: FileCheck },
  ];

  const respondentMenuItems = [
    { id: 'respondent-list' as Screen, label: '배정된 리스크', icon: ClipboardList },
    { id: 'survey' as Screen, label: '설문 응답', icon: FileText },
  ];

  const menuItems = userRole === 'admin' ? adminMenuItems : respondentMenuItems;

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-xl mb-2">기후변화 리스크 설문 플랫폼</div>
          <div className="text-muted-foreground">초기화 중...</div>
        </div>
      </div>
    );
  }

  // Show login if not logged in
  if (!localGovId || !userRole) {
    return (
      <>
        <a
          href={portalToolsUrl}
          className="fixed left-5 top-5 z-20 inline-flex items-center rounded-full border border-emerald-200 bg-white/95 px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm backdrop-blur hover:bg-emerald-50"
        >
          지원도구 페이지로 돌아가기
        </a>
        <div className="fixed right-5 top-5 z-20 w-[min(520px,calc(100vw-2.5rem))]">
          <DemoDataControls onDatasetChanged={handleDatasetChanged} />
        </div>
        <LoginPage onLogin={handleLogin} />
      </>
    );
  }

  // Show homepage if home screen
  if (currentScreen === 'home') {
    return <HomePage onSelectRole={handleSelectRole} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f8f9]">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 bg-[#073f4d] text-white border-r border-white/10 flex flex-col shadow-xl">
          <div className="p-6 border-b border-white/10">
            <button
              onClick={() => setCurrentScreen(userRole === 'admin' ? 'dashboard' : 'respondent-list')}
              className="w-full mb-4 text-left hover:text-[#86efac] transition-colors"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white text-[#064e3b] font-bold mb-3">SV</div>
              <h2 className="leading-tight">기후변화 리스크 설문 플랫폼</h2>
            </button>
            <a
              href={portalToolsUrl}
              className="mb-4 inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:bg-white/20"
            >
              지원도구 페이지로 돌아가기
            </a>
            {loginRole === 'admin' && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUserRole('admin');
                    setCurrentScreen('dashboard');
                  }}
                  className={`flex-1 px-3 py-2 rounded transition-colors ${
                    userRole === 'admin'
                      ? 'bg-[#00c896] text-[#063b42]'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  관리자
                </button>
                <button
                  onClick={() => {
                    setUserRole('respondent');
                    setCurrentScreen('respondent-list');
                  }}
                  className={`flex-1 px-3 py-2 rounded transition-colors ${
                    userRole === 'respondent'
                      ? 'bg-[#00c896] text-[#063b42]'
                      : 'bg-white/10 text-white/80 hover:bg-white/20'
                  }`}
                >
                  응답자
                </button>
              </div>
            )}
          </div>

          <nav className="flex-1 p-4">
            <div className="space-y-1">
              {menuItems.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentScreen(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      currentScreen === item.id
                        ? 'bg-white text-[#073f4d] shadow'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="mb-3">
              <div className="mb-2">
                <div className="text-white/55">이름</div>
                <div className="font-medium">{userName}</div>
              </div>
              <div className="text-white/55 mb-1">{localGov?.displayName}</div>
              <div className="text-white/70">{userDepartment}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              로그아웃
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-4 left-4 z-10 p-2 bg-white rounded-lg border border-border shadow-sm hover:shadow"
        >
          <Menu className="w-5 h-5" />
        </button>

        {currentScreen !== 'survey' && localGov && (
          <div className="sticky top-0 z-[5] border-b border-emerald-100 bg-white/90 px-8 py-3 backdrop-blur">
            <div className="ml-12 flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
                  <MapPin className="h-4 w-4" />
                  현재 지역
                </span>
                <strong className="text-slate-950">{localGov.displayName}</strong>
                <span className="text-slate-400">계정 기준으로 지도와 응답 현황이 연결됩니다.</span>
              </div>
              <div className="max-w-xl flex-1 md:min-w-[460px]">
                <DemoDataControls onDatasetChanged={handleDatasetChanged} />
              </div>
            </div>
          </div>
        )}

        <div key={datasetVersion}>
          {currentScreen === 'dashboard' && (
            <AdminDashboard onNavigate={(screen) => setCurrentScreen(screen)} />
          )}
          {currentScreen === 'risks' && <RiskManagement localGovId={localGovId} />}
          {currentScreen === 'context' && (
            <ContextEditor
              localGovId={localGovId}
              localGovName={localGov?.displayName}
            />
          )}
          {currentScreen === 'assignment' && <DepartmentAssignment />}
          {currentScreen === 'respondent-list' && (
            <RespondentRiskList
              onStartSurvey={(riskId) => {
                setSelectedRiskId(riskId);
                setCurrentScreen('survey');
              }}
              userDepartment={userDepartment}
              localGovId={localGovId}
            />
          )}
          {currentScreen === 'survey' && (
            <SurveyResponse
              onBack={() => setCurrentScreen('respondent-list')}
              localGovId={localGovId}
              riskId={selectedRiskId}
              userDepartment={userDepartment}
            />
          )}
          {currentScreen === 'review' && <ResponseReview />}
          {currentScreen === 'results' && <ResultsSummary />}
        </div>
      </div>
    </div>
  );
}
