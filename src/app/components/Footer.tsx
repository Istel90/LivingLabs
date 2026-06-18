export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="mb-3 font-semibold leading-6 text-white">
              서울시립대학교
              <br />
              융합환경계획연구실
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  연구실 소개
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  협력기관
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  문의
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  소식
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">자료</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  지식 자료
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  도구와 방법론
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  적용 사례
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  발간자료
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">지원</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  도움말
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  자주 묻는 질문
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  교육 자료
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  기술 지원
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">정책</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  개인정보 처리방침
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  이용약관
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  접근성 안내
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  사이트맵
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#004494] rounded flex items-center justify-center text-white text-xs font-bold">
              UOS
            </div>
            <p className="text-sm">
              © 2026 서울시립대학교 융합환경계획연구실
            </p>
          </div>
          <div className="text-sm">
            <span>운영</span>{' '}
            <a href="#" className="text-[#4da6ff] hover:underline">
              서울시립대학교 융합환경계획연구실
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
