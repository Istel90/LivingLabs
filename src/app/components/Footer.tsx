export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300 mt-12">
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <h3 className="font-semibold text-white mb-3">About Climate-ADAPT</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Partners
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Contact
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  News
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Resources</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Knowledge Base
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Tools & Methods
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Case Studies
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Publications
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Support</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Training
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Technical Support
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-white mb-3">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Terms of Use
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Accessibility
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white transition-colors">
                  Sitemap
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#004494] rounded flex items-center justify-center text-white text-xs font-bold">
              EU
            </div>
            <p className="text-sm">
              © 2026 European Environment Agency
            </p>
          </div>
          <div className="text-sm">
            <span>Managed by the</span>{' '}
            <a href="#" className="text-[#4da6ff] hover:underline">
              European Environment Agency
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
