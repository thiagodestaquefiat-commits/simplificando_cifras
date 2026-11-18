# Dedicated sign-in screen

Entrar on the welcome screen opens a separate full-page sign-in composition inside the existing gate. Back restores the welcome screen. Uses canonical ROUDY background, control surface, blue action, Inter body/control and Manrope heading tokens. E-mail (the supported identifier), password, reveal control and enabled/disabled submit states follow the supplied reference. No username lookup is invented.

Password authentication uses the existing Supabase client through appAuth.signInWithPassword. Result must contain a real session; existing auth subscribers handle account/data restoration. Error text is generic. No password/token is stored by the new UI or remembered-profile record. Existing provider-managed session storage remains unchanged.

Entrar sem senha switches the same page to the existing email-link API, explicitly shouldCreateUser:false. Google and free signup remain available on the welcome screen. Password login works for accounts with a configured password; Google/link-only users can continue through their existing methods.

Remembered account: latest successfully authenticated account's id, name, email and avatar stored under sc_remembered_login_v1, updated on auth/profile events. Never treats a local remembered profile as a session. Prefills e-mail only. A frame shows avatar/name/email; missing/failed photo falls back to initials. Usar outra conta clears the fields and frame for that attempt. Sign-out retains this minimal identifier for the next visit; no credentials are remembered by this module.

APPLE DESIGN RESEARCH

Question: Como separar login de cadastro e facilitar retorno de uma conta conhecida com clareza?

Sources consulted: Apple HIG Managing accounts, design/human-interface-guidelines/managing-accounts (search + read); official Supabase signInWithPassword API, https://supabase.com/docs/reference/javascript/auth-signinwithpassword.

Apple explicit guidance: Identificar o método de autenticação disponível e permitir experimentar o app sem conta quando ela não é necessária para a função principal.

Design inference: Um quadro com identificação lembrada ajuda a reconhecer a conta, mas não substitui autenticação. Campos com autocomplete apropriado permitem o gerenciador de senhas do sistema.

ROUDY-specific decision: Manter Google, convidado e link de e-mail; tela dedicada para e-mail/senha no Entrar; identificação local da última conta autenticada; tokens e tipografia existentes.

Implementation: js/login-signin.js controls the page and remembered identity; js/app-auth.js wraps password auth; index.html markup/entry; css/login-gate.css canonical styling; service-worker.js asset cache.

Validation: password API success/error/unconfigured provider; existing Google/PKCE/offline auth; remembered metadata contains only four identity fields; account replacement/logout retention; responsive page, saved profile, alternate account, password reveal, failed login, no implicit signup, email-link switch, Back, entry visibility. Tests use mocked services; no real password attempt or email was sent.

## Passwordless shortcut restricted to developer previews

The Entrar sem senha shortcut starts hidden in HTML/CSS and is shown only on localhost, 127.0.0.1 and deploy-preview-N--simplificandocifras.netlify.app. Its public UI action also checks this host gate; query parameters cannot enable it in production. Password error copy no longer references the hidden shortcut. Existing welcome Google/email/signup flows are unchanged.

Tests cover production host, custom production domain, preview host, both local hosts and an unrelated Netlify preview, plus the existing sign-in browser flow. This controls UI availability; it does not alter Supabase authentication settings.
