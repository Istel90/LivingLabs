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
import { Button } from './components/ui/Button';
import { Home, FolderKanban, Users, FileText, ClipboardList, BarChart3, FileCheck, Menu, LogOut } from 'lucide-react';
import { seedDatabase } from './lib/seedData';
import { getLocalGovernment } from './data/localGovernments';

type Screen = 'home' | 'dashboard' | 'risks' | 'context' | 'assignment' | 'respondent-list' | 'survey' | 'review' | 'results';

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
    return <LoginPage onLogin={handleLogin} />;
  }

  // Show homepage if home screen
  if (currentScreen === 'home') {
    return <HomePage onSelectRole={handleSelectRole} />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 bg-white border-r border-border flex flex-col">
          <div className="p-6 border-b border-border">
            <button
              onClick={() => setCurrentScreen(userRole === 'admin' ? 'dashboard' : 'respondent-list')}
              className="w-full mb-4 text-left hover:text-primary transition-colors"
            >
              <h2>기후변화 리스크 설문 플랫폼</h2>
            </button>
            {loginRole === 'admin' && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUserRole('admin');
                    setCurrentScreen('dashboard');
                  }}
                  className={`flex-1 px-3 py-2 rounded transition-colors ${
                    userRole === 'admin'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
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
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 hover:bg-gray-200'
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
                        ? 'bg-primary text-white'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="p-4 border-t border-border">
            <div className="mb-3">
              <div className="mb-2">
                <div className="text-muted-foreground">이름</div>
                <div className="font-medium">{userName}</div>
              </div>
              <div className="text-muted-foreground mb-1">{localGov?.displayName}</div>
              <div className="text-muted-foreground">{userDepartment}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
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

        {currentScreen === 'dashboard' && (
          <AdminDashboard onNavigate={(screen) => setCurrentScreen(screen)} />
        )}
        {currentScreen === 'risks' && <RiskManagement />}
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
  );
}