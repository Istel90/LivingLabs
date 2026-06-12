import { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { authenticateUser, getLocalGovernment } from '../../data/localGovernments';
import { CloudRain, User, Lock } from 'lucide-react';

interface LoginPageProps {
  onLogin: (localGovId: string, role: 'admin' | 'respondent', userName: string, userDept: string) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    const account = authenticateUser(username, password);

    if (account) {
      const localGov = getLocalGovernment(account.localGovId);
      if (localGov) {
        onLogin(account.localGovId, account.role, account.name, account.department);
      }
    } else {
      setError('아이디 또는 비밀번호가 일치하지 않습니다.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-8">
      <Card className="max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <CloudRain className="w-10 h-10 text-primary" />
            <h1 className="text-2xl">기후변화 리스크 설문</h1>
          </div>
          <p className="text-muted-foreground">
            지자체 기후대응 협업 플랫폼
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block mb-2">아이디</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="사용자 아이디 입력"
                className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-input-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block mb-2">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="비밀번호 입력"
                className="w-full pl-10 pr-4 py-3 border border-border rounded-lg bg-input-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full"
            onClick={handleLogin}
            disabled={!username || !password}
          >
            로그인
          </Button>
        </div>

        <div className="mt-6 pt-6 border-t border-border">
          <div className="text-sm text-muted-foreground mb-3">테스트 계정:</div>
          <div className="space-y-2 text-sm">
            <div className="p-2 bg-gray-50 rounded">
              <div className="font-medium">인천광역시 관리자</div>
              <div className="text-muted-foreground">ID: incheon_admin / PW: test123</div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <div className="font-medium">인천광역시 응답자</div>
              <div className="text-muted-foreground">ID: incheon_user / PW: test123</div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <div className="font-medium">수원시 관리자</div>
              <div className="text-muted-foreground">ID: suwon_admin / PW: test123</div>
            </div>
            <div className="p-2 bg-gray-50 rounded">
              <div className="font-medium">수원시 응답자</div>
              <div className="text-muted-foreground">ID: suwon_user / PW: test123</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
