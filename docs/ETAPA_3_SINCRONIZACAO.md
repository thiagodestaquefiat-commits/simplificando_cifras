# Etapa 3 — Sincronização discreta, com recuperação

Implementada localmente em 01/10/2026. Sem deploy, publicação no GitHub ou alterações no banco de produção. Escopo: biblioteca pessoal de músicas. As permissões e a sincronização de eventos não foram reescritas.

## Alterações visíveis

1. Uma informação pequena abaixo do contador de músicas no cabeçalho principal indica o estado da biblioteca.
2. Visitante e alterações pendentes: “Alterações salvas neste dispositivo”.
3. Offline: “Aguardando conexão para sincronizar”.
4. Falha: “Não foi possível sincronizar agora”, preservando dados locais e permitindo nova tentativa automática.
5. “Tudo atualizado” só é mostrado no estado sincronizado com confirmação recebida do servidor, sem pendências/conflitos. Salvar localmente não produz essa confirmação.
6. Ao preservar uma edição conflitante, aviso discreto: “Encontramos outra edição desta música e preservamos uma cópia para você”. Não se abre uma tela obrigatória.
7. As cópias ficam na função existente Configurações → Ajuda e Suporte → Backup e dados → Opções avançadas → Recuperar versões. Recuperar cria uma música nova e não substitui a ativa.
8. As informações técnicas permanecem recolhidas em Opções avançadas. Atualizar o estado não fecha as opções que o usuário abriu.
9. Textos novos traduzidos nos seis idiomas. Letras e cifras continuam sem tradução.

## Regra de resolução adotada

- Cada música sincronizada passa a guardar a versão de conteúdo confirmada como base da próxima comparação, dentro dos metadados locais de sincronização. Isso aumenta o espaço local usado por música; não é uma migração para IndexedDB.
- Campos independentes, como artista e observações, são mesclados automaticamente quando comparados à mesma base confirmada.
- Letra, cifra, resumo, representações do editor, tablatura, tom e capotraste são tratados como uma unidade musical: não misturar representações de duas edições concorrentes.
- Se as duas edições alteraram a mesma unidade de maneiras diferentes: a versão confirmada do servidor fica ativa; a edição local vai para recuperação **antes** de qualquer substituição.
- Não usar relógio do aparelho para escolher vencedor. Versão local datada de 2099 não ganha por isso.
- Bibliotecas antigas sem base confirmada: preservação conservadora da edição local, seguida de adoção da versão do servidor, em vez de tentar adivinhar alterações independentes.
- Se não for possível gravar a recuperação, a substituição é interrompida. O usuário continua com a edição local e recebe estado de erro.
- Recuperações repetidas idênticas não são adicionadas novamente ao histórico. Continuam os limites da etapa 1: 20 versões recentes por identidade, até 1 MB. O histórico não substitui backup exportado.

## Exclusão versus edição

- Exclusão remota: preservar a música local antes de aplicar a exclusão, inclusive se houver edição offline.
- Exclusão local pendente: consultar a versão atual da música no servidor e preservá-la antes de enviar DELETE. Isso conserva uma edição feita em outro dispositivo depois da exclusão local.
- DELETE inclui a versão esperada. Se houver edição entre consulta e exclusão, o servidor responde com conflito; a tentativa seguinte consulta e preserva a nova versão antes de tentar excluir novamente.
- Resultado ativo: música excluída. Resultado recuperável: versões anteriores/editadas no histórico. Recuperar como cópia usa identificadores novos para não ressuscitar o registro excluído.
- Registros de exclusão passam a guardar a versão que o aparelho conhecia, quando disponível; a checagem de DELETE usa a versão efetivamente consultada no servidor.

## Falhas e continuidade

- Alterações locais não são descartadas por falha de conexão; tentativas automáticas com espera de 5, 10, 20, 40 e até 60 segundos enquanto autenticado e online.
- Logout/troca de conta cancelam as tentativas anteriores. Respostas tardias continuam sujeitas à proteção de identidade da etapa 1.
- Resposta inesperadamente vazia mantém a biblioteca local e bloqueia envio inseguro; essa proteção já existia e foi preservada.
- Resposta com versão menor que a já confirmada não desfaz a biblioteca local: é rejeitada e poderá ser consultada novamente.
- Uma edição feita enquanto outra versão está sendo enviada não é marcada como sincronizada nem sobrescrita pela confirmação antiga. Continua pendente para o próximo envio.
- Capotraste deixa de ser ignorado no cálculo de alterações. Mudar somente o capotraste também gera uma pendência de sincronização.

## Arquivos desta etapa

- Novo `js/library-sync-policy.js`: resolução conservadora por base de versão.
- `js/library-sync.js`: base confirmada, integração com recuperação, exclusões protegidas, continuidade/retry e estados confirmados.
- `js/library-recovery.js`: evitar recuperação idêntica repetida.
- `js/song-repository.js`: versão conhecida no registro de exclusão.
- `backend/app/routes/library.py`: checagem opcional de versão no DELETE, mantendo compatibilidade com clientes antigos.
- `index.html`, `js/ui-i18n.js`: indicação discreta e mensagens traduzidas.
- `service-worker.js`: cache atualizado e novos módulos para uso local/offline; sem limpar bibliotecas do usuário.
- `package.json`, testes de sincronização/idiomas/cache: inclusão dos testes novos e atualização dos textos/versões esperados.
- `docs/PRD_ROUDY.md`: comportamento da etapa 3 atualizado.

## Validação

Testes novos: campos independentes, conflito musical, base ausente, relógio local incorreto, edição/exclusão nos dois sentidos, falta de espaço, servidor vazio/desatualizado, retry, logout, edição durante envio e capotraste. Interface testada em celular e desktop, confirmação real do estado, visitante/offline/erro, idiomas e acesso à recuperação. Teste do backend confirma que DELETE de uma versão antiga não apaga a nova edição.

Para validar entre contas/dispositivos reais, publicar o frontend e o backend em conjunto. O preview local segue usando o endereço de API que já estava configurado: não foi redirecionado nem atualizado o serviço publicado nesta etapa.
