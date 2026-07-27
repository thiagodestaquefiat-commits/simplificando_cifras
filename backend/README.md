# Backend de resumo harmônico

Backend Flask da primeira versão da IA do Simplificando Cifras. Nesta sprint,
aceita pesquisa por título/artista e texto colado. Não recebe arquivos e não
salva músicas ou conteúdo enviado.

## Execução local

Requer Python 3.11 ou superior.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Preencha `OPENAI_API_KEY` e ajuste `CORS_ALLOWED_ORIGINS`. Depois:

```powershell
python run.py
```

O servidor fica em `http://127.0.0.1:5000`. A chave existe somente no backend.
O arquivo `.env` é ignorado pelo Git.

O limitador usa `memory://` localmente. Em produção com múltiplas instâncias ou
workers, configure `RATELIMIT_STORAGE_URI` com a URL privada de um Redis para
compartilhar os contadores.

## Endpoint

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

Resultados de pesquisa são limitados a confiança média, recebem aviso de
incerteza e nunca são salvos pelo backend. O frontend deverá abrir o resultado
como rascunho no editor em uma sprint posterior.

O normalizador preserva a grafia musical válida recebida (`Db`, `Gb/Bb`) na
resposta. Uma representação canônica em sustenidos (`C#`, `F#/A#`) fica
disponível somente para comparação e resolução interna de diagramas.

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
no painel do Railway. Não publique `.env`.
