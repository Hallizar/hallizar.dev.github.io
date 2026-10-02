import type { IncomingMessage, ServerResponse } from 'http';

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export function githubAuthMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  const urlString = req.url || '';
  const host = req.headers.host || 'localhost:3000';
  const proto = (req.headers['x-forwarded-proto'] as string) || (host.includes('localhost') ? 'http' : 'https');
  const baseUrl = process.env.APP_URL || `${proto}://${host}`;

  // 1. OAUTH INITIATION: /api/auth/github or /auth?provider=github
  if (
    urlString.startsWith('/api/auth/github') && !urlString.startsWith('/api/auth/github/callback') ||
    urlString.startsWith('/auth?provider=github') ||
    urlString.startsWith('/auth/?provider=github')
  ) {
    const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID || '';
    const redirectUri = `${baseUrl}/api/auth/github/callback`;

    if (!clientId) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>GitHub OAuth Setup</title>
          <style>
            body { font-family: monospace; background: #0c0c12; color: #ddd; padding: 30px; line-height: 1.6; }
            .box { max-width: 540px; margin: 0 auto; background: #12121a; border: 1px solid #282838; padding: 24px; border-radius: 8px; }
            h2 { color: #fff; margin-top: 0; }
            code { background: #1c1c28; padding: 2px 6px; border-radius: 4px; color: #00ff9d; }
            a { color: #bd5aff; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>GitHub OAuth: Требуется настройка</h2>
            <p>Переменные <code>GITHUB_CLIENT_ID</code> и <code>GITHUB_CLIENT_SECRET</code> пока не установлены в окружении.</p>
            <p>Вы можете:</p>
            <ol>
              <li>Использовать <strong>Personal Access Token (PAT)</strong> прямо в окне входа админки (работает мгновенно без настройки OAuth App).</li>
              <li>Или создать OAuth App на <a href="https://github.com/settings/developers" target="_blank">GitHub Developer Settings</a> с Callback URL:<br>
                <code>${redirectUri}</code>
              </li>
            </ol>
            <p style="text-align: center; margin-top: 24px;">
              <button onclick="window.close()" style="background: #8a00ff; color: #fff; border: 0; padding: 8px 18px; font-family: monospace; font-weight: bold; cursor: pointer; border-radius: 4px;">Закрыть окно</button>
            </p>
          </div>
        </body>
        </html>
      `);
      return;
    }

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=repo,user&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.writeHead(302, { Location: githubAuthUrl });
    res.end();
    return;
  }

  // 2. OAUTH CALLBACK: /api/auth/github/callback
  if (urlString.startsWith('/api/auth/github/callback')) {
    const parsedUrl = new URL(urlString, `${proto}://${host}`);
    const code = parsedUrl.searchParams.get('code');
    const clientId = process.env.GITHUB_CLIENT_ID || process.env.CLIENT_ID || '';
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.CLIENT_SECRET || '';
    const redirectUri = `${baseUrl}/api/auth/github/callback`;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h3>Ошибка: Отсутствует код авторизации GitHub</h3>');
      return;
    }

    // Exchange authorization code for token
    fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Hallizar-Blog-DecapCMS',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })
      .then((ghRes) => ghRes.json())
      .then((data: GitHubTokenResponse) => {
        if (data.access_token) {
          const token = data.access_token;
          const content = JSON.stringify({ token, provider: 'github' });

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!doctype html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Авторизация успешна</title>
              <style>
                body { font-family: monospace; background: #0c0c12; color: #fff; padding: 40px; text-align: center; }
                .success { color: #00ff9d; font-size: 16px; font-weight: bold; margin-bottom: 8px; }
              </style>
            </head>
            <body>
              <div class="success">✓ Авторизация через GitHub успешна!</div>
              <p>Токен получен. Передача сессии в Decap CMS...</p>
              <script>
                (function() {
                  var token = ${JSON.stringify(token)};
                  var message = "authorization:github:success:" + ${JSON.stringify(content)};
                  
                  function receiveMessage(e) {
                    if (window.opener) {
                      window.opener.postMessage(message, e.origin);
                      window.removeEventListener("message", receiveMessage, false);
                      setTimeout(function() {
                        window.close();
                      }, 400);
                    }
                  }

                  window.addEventListener("message", receiveMessage, false);

                  if (window.opener) {
                    window.opener.postMessage("authorizing:github", "*");
                  }

                  // Also broadcast standard event
                  if (window.opener) {
                    window.opener.postMessage({ type: 'GITHUB_AUTH_SUCCESS', token: token }, '*');
                  }
                })();
              </script>
            </body>
            </html>
          `);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!doctype html>
            <html>
            <body style="font-family: monospace; background: #0c0c12; color: #ff6b8b; padding: 30px;">
              <h3>Ошибка получения токена GitHub</h3>
              <p>${data.error_description || data.error || 'Неизвестная ошибка'}</p>
              <button onclick="window.close()" style="background: #222; color: #fff; border: 1px solid #444; padding: 8px 16px; cursor: pointer;">Закрыть</button>
            </body>
            </html>
          `);
        }
      })
      .catch((err) => {
        console.error('GitHub token exchange error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h3>Ошибка сервера при обмене токена GitHub</h3>');
      });

    return;
  }

  next();
}
