# Backend do Simplificando Cifras

Backend Flask da IA e dos Eventos/Repertórios colaborativos do Simplificando
Cifras. A IA não salva músicas nem mantém cópias dos arquivos recebidos. O
módulo colaborativo persiste usuários, eventos, membros, repertório oficial e
personalizações individuais em banco relacional. Também oferece contas externas
opcionais e Bandas/Equipes sem remover o funcionamento local.

## Execução local

Requer Python 3.11 ou superior.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Preencha `OPENAI_API_KEY`, `DATABASE_URL` e ajuste `CORS_ALLOWED_ORIGINS`. Para
desenvolvimento, o padrão usa SQLite; no Railway, use a URL privada do
PostgreSQL provisionado. Para habilitar endereços e mapas, preencha também
`GEOAPIFY_API_KEY`. Para habilitar o login, preencha `SUPABASE_URL` e
`SUPABASE_ANON_KEY`. Depois:

```powershell
python run.py
```

O servidor fica em `http://127.0.0.1:5000`. A chave existe somente no backend.
O arquivo `.env` é ignorado pelo Git.

O limitador usa `memory://` localmente. Em produção com múltiplas instâncias ou
workers, configure `RATELIMIT_STORAGE_URI` com a URL privada de um Redis para
compartilhar os contadores.

## Resumo harmônico

`POST /api/resumo-harmonico`

Pesquisa:

```json
{
  "tipo": "pesquisa",
  "titulo": "Rugido do Leão",
  "artista": "Talita Catanzaro"
}
```

Texto:

```json
{
  "tipo": "texto",
  "titulo": "Canção",
  "artista": null,
  "conteudo": "Dm  Bb  C  G\nFrase curta"
}
```

Arquivo (`multipart/form-data`): campos `arquivo`, `titulo` opcional e `artista`
opcional. São aceitos PDF (até 20 páginas), PNG, JPG/JPEG, WebP e TXT, com limite
padrão de 10 MB. O backend valida extensão, MIME e assinatura dos bytes. PDFs
textuais e TXT são extraídos localmente; imagens e PDFs escaneados usam a entrada
visual do modelo. Todo o processamento intermediário ocorre em memória.

Resultados de pesquisa são limitados a confiança média, recebem aviso de
incerteza e nunca são salvos pelo backend. O frontend deverá abrir o resultado
como rascunho no editor em uma sprint posterior.

O normalizador preserva a grafia musical válida recebida (`Db`, `Gb/Bb`) na
resposta. Uma representação canônica em sustenidos (`C#`, `F#/A#`) fica
disponível somente para comparação e resolução interna de diagramas.

## Eventos e repertórios colaborativos

As rotas ficam sob `/api/collaboration`. `POST /users` registra a identidade
local e devolve uma credencial uma única vez. As demais rotas exigem
`Authorization: Bearer <token>`.

Principais operações:

- `GET/POST /events`: listar os eventos do integrante ou criar um evento;
- `GET/PUT/DELETE /events/<id>`: consultar, substituir ou excluir um evento;
- `PATCH /events/<id>/repertoire/<item>/shared`: editar título, artista, tom, capotraste, cifra e observações oficiais;
- `PUT/DELETE /events/<id>/repertoire/<item>/personal`: salvar ou limpar a versão pessoal completa do usuário autenticado.
- `GET/POST /bands`: listar ou criar Bandas/Equipes;
- `POST/PATCH/DELETE /bands/<id>/members`: gerenciar integrantes e funções.

Somente o Líder pode criar alterações compartilhadas, mudar membros, ordem,
repertório e informações do evento. Todo integrante do evento pode ler a versão
oficial e salvar somente a própria personalização. A resposta nunca inclui a
personalização de outro usuário. A API usa uma versão do evento para rejeitar
atualizações concorrentes com HTTP 409. IDs adicionados como membros precisam
corresponder a usuários já registrados; isso impede que uma escala remota fique
vinculada a um perfil inexistente ou que não conseguirá acessá-la.

### Estrutura do banco

As tabelas são criadas de forma não destrutiva na inicialização quando ainda não
existem:

- `collaboration_users` e `user_access_tokens`;
- `events` e `event_members`;
- `event_repertoire_items`;
- `personal_repertoire_overrides`;
- `event_changes`.

O repertório oficial é armazenado uma única vez. `personal_repertoire_overrides`
guarda apenas as diferenças de cada integrante. Os campos de arranjo completo
são adicionados por uma migration interna exclusivamente aditiva. Tokens são
persistidos somente como hash SHA-256. Não há migration que remova ou renomeie
estruturas existentes.

### Login e migração da identidade local

Quando `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão vazios, o aplicativo continua
usando a identidade local atual. Quando configurados, o frontend oferece login
com Google via Supabase Auth e o backend valida cada token diretamente no
serviço de autenticação. A `service_role` não é necessária e nunca deve ser
enviada ao navegador.

No primeiro login, o token local anterior é apresentado uma única vez ao
backend para migrar Eventos, liderança, personalizações e participação em
Equipes para a conta autenticada. A operação invalida o token local migrado e
não duplica repertórios.

No painel do Supabase, habilite Google em Authentication → Providers. Em URL
Configuration, cadastre como Site URL a URL oficial do Netlify e permita também
`http://127.0.0.1:4173/` durante o desenvolvimento. As credenciais Google ficam
no Supabase; o Railway recebe somente as variáveis indicadas no `.env.example`.

### Bandas e Equipes

As tabelas `bands` e `band_members` armazenam proprietário, líderes,
integrantes e função musical. Um Evento pode possuir `band_id`, mas o campo é
opcional para preservar todos os registros antigos. Quando há uma Equipe, o
backend exige que criador, Líder do Evento e participantes pertençam a ela.

## Endereços e mapas de eventos

`GET /api/locations/search?q=...` pesquisa até cinco endereços brasileiros e
devolve somente o modelo normalizado usado pelo frontend. `GET
/api/locations/map?latitude=...&longitude=...` entrega uma imagem estática com
marcador. As duas rotas são limitadas por IP; buscas repetidas e mapas são
mantidos em cache no processo para reduzir consumo externo.

A chave do Geoapify fica em `GEOAPIFY_API_KEY` no Railway e não é enviada ao
navegador. O frontend espera 400 ms, ignora buscas menores que quatro caracteres
e cancela a requisição anterior. Eventos guardam o endereço textual legado e,
quando uma sugestão é escolhida, os campos estruturados, coordenadas, `placeId`
e provedor. As novas colunas de `events` são criadas pela migration interna
aditiva; eventos antigos continuam válidos e apenas não exibem o mapa.

## Modelo OpenAI

O padrão inicial é `gpt-5.6-luna`, modelo oficial compatível com Responses API
e Structured Outputs, escolhido para esta primeira validação por ser voltado a
cargas sensíveis a custo. O valor não é fixo: altere `OPENAI_MODEL` no ambiente
sem modificar rotas, schemas ou serviços.

Antes de publicar, confirme o acesso ao modelo com a chave e a conta que serão
usadas no Railway. Registre nesta documentação o modelo efetivamente usado no
primeiro teste real.

## Testes

```powershell
cd backend
python -m pytest
```

Os testes usam um provider falso; não consomem a API da OpenAI.

## Railway

Configure o diretório raiz do serviço como `backend`, instale
`requirements.txt`, use o `Procfile` e cadastre as variáveis do `.env.example`
no painel do Railway. Provisione PostgreSQL e associe sua `DATABASE_URL` ao
serviço. Na primeira inicialização, as novas tabelas são criadas sem apagar as
estruturas já existentes. Não publique `.env`.
