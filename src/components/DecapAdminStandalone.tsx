import { useEffect } from 'react';

export function DecapAdminStandalone() {
  useEffect(() => {
    document.title = 'Content Manager | Decap CMS';

    // Ensure Netlify Identity widget is loaded
    if (!document.getElementById('netlify-identity-script')) {
      const identityScript = document.createElement('script');
      identityScript.id = 'netlify-identity-script';
      identityScript.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
      identityScript.async = true;
      document.head.appendChild(identityScript);
    }

    // Ensure Decap CMS core is loaded
    if (!document.getElementById('decap-cms-script')) {
      const cmsScript = document.createElement('script');
      cmsScript.id = 'decap-cms-script';
      cmsScript.src = 'https://unpkg.com/decap-cms@^3.1.2/dist/decap-cms.js';
      cmsScript.async = true;
      document.body.appendChild(cmsScript);
    }

    const checkIdentity = () => {
      if ((window as any).netlifyIdentity) {
        (window as any).netlifyIdentity.on('init', (user: any) => {
          if (!user) {
            (window as any).netlifyIdentity.on('login', () => {
              window.location.reload();
            });
          }
        });
      }
    };

    const timer = setTimeout(checkIdentity, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#111116] text-[#e0e0e6] flex flex-col justify-center items-center p-6 font-mono text-xs">
      <div id="nc-root" className="w-full h-full flex flex-col items-center justify-center">
        <div className="max-w-md w-full p-8 border border-[#2b2b36] bg-[#0c0c11] rounded-xs shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 bg-[#8a00ff] text-white font-bold text-lg rounded-xs mx-auto grid place-items-center shadow-lg">
            CMS
          </div>

          <h1 className="text-xl font-bold font-sans text-white">
            Decap CMS &middot; Netlify Identity
          </h1>

          <p className="text-[#888894] text-xs leading-relaxed">
            Вход в защищённую панель управления рекламными кампаниями и блогом через Netlify Git Gateway.
          </p>

          <div className="pt-2">
            <button
              onClick={() => {
                if ((window as any).netlifyIdentity) {
                  (window as any).netlifyIdentity.open('login');
                } else {
                  window.location.href = '/admin/';
                }
              }}
              className="ui-button primary w-full justify-center py-2.5 text-xs font-bold"
            >
              Войти через Netlify Identity
            </button>
          </div>

          <div className="pt-4 border-t border-[#1c1c24] flex items-center justify-between text-[10px] text-[#666]">
            <span>Доступ: Invite Only</span>
            <a href="/" className="text-[#bd5aff] hover:underline">
              &larr; Вернуться на сайт
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
