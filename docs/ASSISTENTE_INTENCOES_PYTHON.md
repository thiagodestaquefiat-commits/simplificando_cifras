# Motor local de intenções em Python

## Escopo desta entrega

Código funcional e independente em `backend/voice_assistant/`. Não usa IA generativa,
API paga, internet ou banco real. O motor usa `difflib.SequenceMatcher`, alternativa
da biblioteca padrão ao fuzzywuzzy, com similaridade de caracteres e tokens.
`tzdata` fornece os fusos IANA também no Windows.

**Conectado ao botão do assistente na versão local.** O reconhecimento de áudio
permanece no navegador: a transcrição entra no roteador JavaScript existente, que
usa o novo motor para navegação natural e datas. Comandos existentes de músicas,
BPM, rolagem, idioma, cores e outros controles são preservados. Python no servidor
exige conexão; o fallback fuzzy no navegador usa o mesmo catálogo quando não há
rede, a API falha, responde de forma inválida ou excede dois segundos.
Não houve publicação em produção desta integração.

## Arquivos

- `nlu.py`: normalização, exemplos, similaridade fuzzy, confiança e ambiguidade.
- `intents.py`: frases de treinamento e conceitos necessários por intenção.
- `events.py`: relógio injetável, próximo evento e eventos por data local.
- `actions.py`: registro de handlers por decorador e payload padronizado.
- `__main__.py`: banco mockado com passado, próximo e futuro distante; demonstração
  e assertions executáveis.
- `backend/tests/test_voice_assistant.py`: testes determinísticos, sem microfone ou rede.
- `api.py`: validação de contexto efêmero e execução stateless.
- `http_server.py`: helper Python da prévia, somente em loopback, sem carregar `.env`.
- `export_catalog.py`: exporta frases e normalização para o catálogo do navegador.
- `js/assistant-intent-client.js`: fallback fuzzy, timeout e validação de respostas.

## Executar

Na pasta `backend`, com as dependências instaladas:

```powershell
.\.venv\Scripts\python.exe -m voice_assistant
```

Ou, em outro ambiente Python:

```sh
python -m voice_assistant
```

Na raiz do projeto, executar os testes:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend/tests/test_voice_assistant.py -q -p no:cacheprovider
```

## Exemplo do retorno

Para `cara, abre aí o evento que tá mais perto`, a demonstração identifica o
evento 4, ignorando o passado e a ordem da lista:

```json
{
  "action": "navigate",
  "screen": "detalhes_evento",
  "params": {"evento_id": 4},
  "message": "Abrindo Ensaio mais próximo.",
  "intent": "INTENT_PROXIMO_EVENTO",
  "confidence": 0.853
}
```

Os retornos têm sempre `action`, `screen`, `params`, `message`, `intent` e
`confidence`. `confidence` é um score heurístico, **não probabilidade**.

- `navigate`: frontend abre a tela permitida.
- `choose`: há mais de um evento; frontend pede escolha, sem escolher sozinho.
- `inform`: ausência de eventos, operação não implementada ou falha segura.
- `clarify`: entrada desconhecida, negada ou ambígua; não executa ação.

## Datas e limites

O relógio padrão é `datetime.now(ZoneInfo("America/Sao_Paulo"))`; pode ser injetado
para testes. Todas as datas exigem fuso. O próximo evento é o menor instante
maior ou igual ao agora. Eventos empatados são retornados para escolha.

“O que tem amanhã” tem intenção própria: não pode abrir um evento da semana
seguinte quando não há nada amanhã. “Hoje” mostra a agenda do dia, inclusive
eventos que começaram antes do horário atual. Não há parser de “dia 20”, BPM,
nomes de músicas ou todas as operações existentes do assistente nessa primeira base.

O match rejeita baixa confiança e diferença pequena entre intenções. Não é uma
compreensão semântica universal: frases complexas precisam de exemplos e testes.
Negação é recusada conservadoramente. Não inclui ações destrutivas nem interpreta
abrir metrônomo como iniciar/parar áudio. Erros não devolvem traceback ou texto cru.

## Acrescentar uma intenção

Acrescente uma `IntentDefinition` ao catálogo ou registre em tempo de execução:

```python
from voice_assistant import IntentDefinition

manager.classifier.register(IntentDefinition(
    "INTENT_AJUDA", ("abrir ajuda", "me mostre o suporte", "acessar ajuda"),
    (("ajuda", "suporte"),),
))

@manager.register("INTENT_AJUDA")
def abrir_ajuda(text):
    return {
        "action": "navigate", "screen": "ajuda", "params": {},
        "message": "Abrindo ajuda e suporte."
    }
```

Para navegação simples, acrescente também uma entrada ao dicionário de telas em
`create_default_manager`. Para regra de negócio, use um handler. O roteador não
precisa de uma nova ramificação por intenção.

## Integração implementada no Roudy

`npm run dev` inicia a prévia em 4173 e um helper Python em 127.0.0.1:5010. Somente
`POST /api/assistant/resolve` é encaminhado ao helper. As demais APIs continuam com
suas configurações originais. O helper não abre conexão com o banco real ou `.env`.
O backend Flask registra a mesma rota para publicação futura.

O navegador filtra a lista já carregada pelo `eventModel.canAccess` e pela identidade
atual, usando `eventPermissionActor`. Envia somente o comando, fuso e datas associadas
a **índices temporários**, não títulos, membros, letras, emails, UUIDs reais ou tokens.
Essa API pública é puramente computacional (30 requisições/minuto por IP em Flask):
não lê banco, não concede acesso e não salva nada. Os índices só valem na requisição.
Um caller pode inventar seu próprio contexto, mas isso não autoriza nenhuma operação
do aplicativo; as permissões das rotas de negócio continuam obrigatórias.

O horário cadastrado é considerado. Eventos sem horário são tratados como eventos
do dia inteiro: para decidir se ainda são futuros, usa-se o fim do dia como limite
de comparação, sem alterar o horário cadastrado. Datas inválidas são ignoradas.
Contextos com mais de 250 eventos usam o fallback local completo, sem truncar dados.

A resposta é validada por intenção, confiança, ação, tela permitida e índice existente.
Antes de abrir, são conferidos novamente a conta e o conjunto de IDs/datas acessíveis.
Mudança de conta ou repertório descarta a resposta. A navegação fecha telas sobrepostas
e usa as funções já existentes. Empates abrem a lista de eventos para escolha.
O metrônomo mantém seu comportamento contextual dentro da música.

Para adicionar novos exemplos, edite `intents.py`, execute
`python -m voice_assistant.export_catalog` na pasta backend e aplique a saída ao
arquivo `js/assistant-intent-catalog.js`. Um teste garante que os catálogos continuam
iguais. Nova ação exige handler Python e uma execução explicitamente permitida no
frontend, nunca `eval` ou URLs arbitrárias. As demais funções continuam no roteador
legado até sua migração ser coberta por testes específicos.

Testes cobrem o clique no botão e uma transcrição simulada, Python real, evento correto,
fechamento da música, offline, exclusão de evento privado e descarte após troca de conta.
Microfone/serviço de reconhecimento reais precisam de validação no navegador do usuário.
Nenhum texto de voz, evento pessoal, credencial ou áudio é persistido por este módulo.
