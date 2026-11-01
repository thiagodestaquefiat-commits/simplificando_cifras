# Capa do cabeçalho por conta

- `ProfileCover` / tabela `profile_covers`: imagem validada e regravada como JPEG, enquadramento e versão. `db.create_all()` cria a nova tabela no início; nenhuma tabela existente é substituída.
- `GET` e `PUT /api/collaboration/me/cover`: autenticação obrigatória, identidade exclusivamente do token, comparação atômica de versão. `null` significa remoção explícita.
- A imagem não entra nos metadados Google/Supabase nem no JWT. Não é a foto de avatar nem a capa de uma playlist.
- `js/profile-cover.js`: cache local `sc_profile_covers_v1` por subject autenticado; visitante tem registro separado. A foto antiga global é migrada uma vez. Uma escolha existente na nuvem prevalece sobre migração automática.
- Alterações são gravadas localmente antes do envio; enquadramento tem envio agrupado. Conexão/foco/login retomam sincronização. Logout espera confirmação de alterações pendentes. Não existe sincronização garantida com o navegador fechado.
- Conflitos preservam o rascunho local e não sobrescrevem o outro aparelho automaticamente. Uma nova escolha explícita confirma a intenção sobre a versão mais recente.
- Publicação exige frontend e backend novos. Até lá, a rota não existe no servidor de produção. Não apagar dados do navegador enquanto houver envio pendente.

## Verificação

`node tests/profile-cover.test.js` — cache, contas, offline, conflitos, remoção e migração.

`node tests/profile-cover-cloud-ui.test.js` — navegadores independentes com Flask e banco isolados reais.

`python -m pytest backend/tests/test_profile_cover.py` — autenticação, imagem, versões, leitura posterior, remoção e isolamento de usuários.
