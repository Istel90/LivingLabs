import { useEffect, useMemo, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import {
  authenticateUser,
  createUserAccount,
  getLocalGovernment,
} from '../../data/localGovernments';
import {
  getRegionByCode,
  getSelectableRegionsBySido,
  sidos,
} from '../../data/administrativeRegions';
import { CloudRain, Lock, MapPin, User, UserPlus } from 'lucide-react';

interface LoginPageProps {
  onLogin: (localGovId: string, role: 'admin' | 'respondent', userName: string, userDept: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const defaultSido = sidos.includes('인천광역시') ? '인천광역시' : sidos[0] || '';
  const [mode, setMode] = useState<'login' | 'create'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'respondent'>('respondent');
  const [selectedSido, setSelectedSido] = useState(defaultSido);
  const selectableRegions = useMemo(() => getSelectableRegionsBySido(selectedSido), [selectedSido]);
  const [selectedRegionCode, setSelectedRegionCode] = useState(selectableRegions[0]?.code || '');

  useEffect(() => {
    setSelectedRegionCode(selectableRegions[0]?.code || '');
  }, [selectableRegions]);

  const selectedRegion = getRegionByCode(selectedRegionCode);

  const handleLogin = () => {
    const account = authenticateUser(username.trim(), password);

    if (account) {
      const localGov = getLocalGovernment(account.localGovId);
      if (localGov) {
        onLogin(account.localGovId, account.role, account.name, account.department);
        return;
      }
      setError('계정에 연결된 행정구역 정보를 찾을 수 없습니다.');
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  const handleQuickLogin = (quickUsername: string, quickPassword: string) => {
    const account = authenticateUser(quickUsername, quickPassword);

    if (!account) {
      setError('빠른 입장 계정을 찾을 수 없습니다.');
      return;
    }

    const localGov = getLocalGovernment(account.localGovId);
    if (!localGov) {
      setError('빠른 입장 계정에 연결된 행정구역 정보를 찾을 수 없습니다.');
      return;
    }

    setUsername(account.username);
    setPassword(account.password);
    setError('');
    onLogin(account.localGovId, account.role, account.name, account.department);
  };

  const handleCreateAccount = () => {
    try {
      setError('');
      if (!newUsername.trim() || !newPassword || !newName.trim() || !newDepartment.trim() || !selectedRegion) {
        setError('계정 정보와 담당 지역을 모두 입력해주세요.');
        return;
      }

      const account = createUserAccount({
        username: newUsername.trim(),
        password: newPassword,
        localGovId: `region:${selectedRegion.code}`,
        regionCode: selectedRegion.code,
        role: newRole,
        name: newName.trim(),
        department: newDepartment.trim(),
      });

      setUsername(account.username);
      setPassword(account.password);
      setMode('login');
      setNewUsername('');
      setNewPassword('');
      setNewName('');
      setNewDepartment('');
      setError('계정이 생성되었습니다. 바로 로그인할 수 있습니다.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '계정 생성에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-[#073f4d] flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,200,150,0.25),transparent_30rem),radial-gradient(circle_at_85%_15%,rgba(14,116,144,0.35),transparent_28rem)]" />
      <Card className="max-w-5xl w-full relative z-10 overflow-hidden bg-white/95 backdrop-blur border-white/40 shadow-2xl">
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="p-8 bg-gradient-to-br from-[#063b42] to-[#0f766e] text-white">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 mb-6">
              <CloudRain className="w-8 h-8 text-[#86efac]" />
            </div>
            <h1 className="text-3xl font-bold mb-3">기후위기 리스크 설문 플랫폼</h1>
            <p className="text-white/75 leading-relaxed mb-8">
              계정에 행정구역을 연결하면 응답자 지도와 현황 정보가 해당 시도·시군구 위치를 기준으로 표시됩니다.
            </p>

            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                <div className="font-semibold">인천 관리자</div>
                <div className="text-white/70">ID: incheon_admin / PW: test123</div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                <div className="font-semibold">인천 응답자</div>
                <div className="text-white/70">ID: incheon_user / PW: test123</div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                <div className="font-semibold">수원 관리자</div>
                <div className="text-white/70">ID: suwon_admin / PW: test123</div>
              </div>
              <div className="p-3 rounded-xl bg-white/10 border border-white/15">
                <div className="font-semibold">수원 응답자</div>
                <div className="text-white/70">ID: suwon_user / PW: test123</div>
              </div>
            </div>
          </div>

          <div className="p-8">
            <div className="flex gap-2 mb-8 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'login' ? 'bg-white shadow text-[#073f4d]' : 'text-slate-500'
                }`}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('create');
                  setError('');
                }}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  mode === 'create' ? 'bg-white shadow text-[#073f4d]' : 'text-slate-500'
                }`}
              >
                계정 만들기
              </button>
            </div>

            {mode === 'login' ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-semibold text-emerald-900">개발 중 빠른 입장</div>
                    <p className="mt-1 text-xs text-emerald-800/80">
                      실제 로그인 기능은 유지하고, 지금은 역할별 화면으로 바로 들어갈 수 있습니다.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      onClick={() => handleQuickLogin('incheon_admin', 'test123')}
                    >
                      관리자 바로 입장
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"
                      onClick={() => handleQuickLogin('incheon_user', 'test123')}
                    >
                      응답자 바로 입장
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block mb-2 font-semibold">아이디</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="text"
                      value={username}
                      onChange={(event) => {
                        setUsername(event.target.value);
                        setError('');
                      }}
                      onKeyDown={(event) => event.key === 'Enter' && handleLogin()}
                      placeholder="사용자 아이디 입력"
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-input-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block mb-2 font-semibold">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError('');
                      }}
                      onKeyDown={(event) => event.key === 'Enter' && handleLogin()}
                      placeholder="비밀번호 입력"
                      className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-input-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  className="w-full"
                  onClick={handleLogin}
                  disabled={!username || !password}
                >
                  로그인
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-2 font-semibold">아이디</label>
                    <input
                      value={newUsername}
                      onChange={(event) => setNewUsername(event.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      placeholder="예: incheon_health"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">비밀번호</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      placeholder="비밀번호"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-2 font-semibold">이름</label>
                    <input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      placeholder="담당자 이름"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">부서</label>
                    <input
                      value={newDepartment}
                      onChange={(event) => setNewDepartment(event.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                      placeholder="예: 건강증진과"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block mb-2 font-semibold">권한</label>
                    <select
                      value={newRole}
                      onChange={(event) => setNewRole(event.target.value as 'admin' | 'respondent')}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    >
                      <option value="admin">관리자</option>
                      <option value="respondent">응답자</option>
                    </select>
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">시도</label>
                    <select
                      value={selectedSido}
                      onChange={(event) => setSelectedSido(event.target.value)}
                      className="w-full px-3 py-2 border border-input rounded bg-input-background"
                    >
                      {sidos.map((sido) => (
                        <option key={sido} value={sido}>{sido}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block mb-2 font-semibold">시군구</label>
                  <select
                    value={selectedRegionCode}
                    onChange={(event) => setSelectedRegionCode(event.target.value)}
                    className="w-full px-3 py-2 border border-input rounded bg-input-background"
                  >
                    {selectableRegions.map((region) => (
                      <option key={region.code} value={region.code}>
                        {region.level === 'sido' ? `${region.displayName} 전체` : region.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedRegion && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    <MapPin className="h-4 w-4" />
                    <span>
                      현재 연결 지역: <strong>{selectedRegion.displayName}</strong> · 행정코드 {selectedRegion.code}
                    </span>
                  </div>
                )}

                <Button variant="primary" className="w-full" onClick={handleCreateAccount}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  계정 생성
                </Button>
              </div>
            )}

            {error && (
              <div className={`mt-5 p-3 rounded-lg text-sm ${
                error.includes('생성되었습니다')
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {error}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
