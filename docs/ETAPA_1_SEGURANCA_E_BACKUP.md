# Etapa 1 — Segurança dos dados e backup

Implementação local de 1 de outubro de 2026. Sem publicação, alteração no Supabase ou mudança na política do catálogo compartilhado. O PRD não foi reescrito nesta etapa.

## Interface

Em Configurações → Ajuda e Suporte → Backup e dados → Opções avançadas:

- Exportar meus dados: arquivo JSON versão 2 da identidade ativa.
- Restaurar backup: leitura dos formatos 1 e 2, revisão e seleção individual de músicas novas.
- Versões diferentes podem ser selecionadas para adicionar uma cópia recuperada; a música atual não é substituída.
- Recuperar versões: cópias anteriores de músicas editadas ou excluídas, separadas por conta/visitante. Recuperar cria outra música.
- Baixar diagnóstico permanece disponível; o arquivo não inclui as linhas de diferenças contendo letras/cifras, títulos ou dados completos retornados pela auditoria do servidor.
- Opções avançadas permanecem abertas durante atualizações do estado de sincronização.
- Layout da seleção e recuperação adaptado a celular e desktop; títulos/artistas são escapados e não traduzidos. Rótulos principais novos traduzidos nos seis idiomas existentes.

## Exportação

- Não lê nem exporta o retrato bruto de localStorage, caches de outras contas, perfil completo ou catálogo padrão separado.
- Exporta músicas da biblioteca ativa, eventos acessíveis, medley em edição, favoritos pertencentes à biblioteca e preferências atuais.
- Nos itens do repertório, mantém apenas a personalização da identidade ativa; não exporta personalizações de outros integrantes.
- Filtra campos de credenciais conhecidos também nos objetos exportados, sem remover letras/cifras e extensões musicais desconhecidas.
- Registra o escopo da exportação, sem incluir sessão de login.
- Bloqueia exportação enquanto a identidade ativa e os dados da conta ainda não estiverem alinhados.
- O arquivo contém conteúdo pessoal e não é criptografado: deve ser guardado com cuidado.

## Restauração e recuperação

- Limite de arquivo: 25 MB, verificado antes da leitura e depois da análise.
- Músicas inválidas bloqueiam a restauração. Arquivo/seleção de outra sessão precisa ser revisto após trocar a conta.
- Detecta músicas existentes por identidade; não duplica automaticamente nem substitui conteúdo diferente.
- Confere novamente os identificadores ao aplicar, evitando substituir uma música que mudou durante a revisão.
- A importação pela interface remove a associação à versão antiga da nuvem, evitando reutilizar metadados de sincronização ou identificadores de exclusão, e atribui escopo pessoal à identidade atual.
- Nesta etapa, apenas músicas são restauradas. Eventos, medleys, favoritos e preferências são exportados, mas não importados automaticamente. A interface informa essa limitação.
- Histórico local: até 20 versões recentes por identidade, com limite de 1 MB. Rotação descarta versões antigas; não é um backup permanente.
- Quando não é possível preservar a versão anterior ou gravar a biblioteca, a edição não é confirmada.
- Histórico começa após esta implementação e não sobrevive à limpeza dos dados do navegador. Ainda não é sincronizado entre dispositivos nem incluído no arquivo de exportação.

## Salvamento e isolamento

- Falhas de gravação local produzem aviso acessível e mais duradouro, sem serem imediatamente ocultadas por uma mensagem de sucesso.
- Criação/edição de músicas só confirma e fecha o formulário depois da persistência.
- Perfil e configurações verificam o resultado da gravação antes de confirmar sucesso.
- Exclusão de música preserva uma versão anterior; falha de registro da exclusão tenta manter a música na biblioteca.
- As gravações das chaves atuais e legadas de músicas/eventos tentam reverter valores anteriores se uma etapa falhar. localStorage não oferece uma transação real: se o navegador também impedir a reversão, não há garantia de atomicidade.
- A sincronização não confirma persistência local que retornou falha.
- Respostas de biblioteca de uma identidade anterior são descartadas após logout ou troca de conta. Estado de diagnóstico e temporizadores são limpos nessa transição.
- Revisões de backup e telas internas são fechadas na troca de identidade; respostas de carregamento de eventos anteriores não atualizam a interface da nova conta.
- Medley em edição passou a ter armazenamento próprio para visitante e caches por conta. Não é agregado silenciosamente a outra conta. Na migração, um medley legado que coincide com um cache privado não é exposto ao visitante; o conteúdo original não é apagado.
- As mudanças não criptografam caches locais nem protegem contra alguém com acesso às ferramentas do navegador ou ao perfil do sistema operacional.

## Arquivos desta etapa

Aplicação: index.html; js/storage.js; js/export-library.js; js/import-library.js; js/library-recovery.js (novo); js/medley-repository.js (novo); js/song-repository.js; js/event-repository.js; js/library-sync.js; js/ui-i18n.js; service-worker.js; package.json.

Testes novos: tests/backup-safety.test.js; tests/account-switch-sync.test.js; tests/backup-ui.test.js.

Testes ajustados: tests/export-library.test.js; tests/library-backup-restore.test.js; tests/library-sync.test.js; tests/medley-key.test.js; tests/ui-i18n.test.js; tests/pwa-branding.test.js.

Alterações anteriores em autenticação, assistente, metrônomo e PRD foram preservadas; não fazem parte desta etapa.

## Validação

- Suíte principal: npm test (44 scripts).
- Fluxo em navegador isolado: seleção, conflito como cópia, recuperação, download JSON, neutralização de HTML em títulos, falta de espaço simulada e largura de celular/desktop.
- Integridade de 138 músicas em exportação/restauração e repetição sem duplicação.
- Cenários de visitante/contas A e B, históricos separados, medleys separados, resposta atrasada de sincronização e falha de persistência.
- A validação não acessa contas reais, não modifica bibliotecas pessoais do navegador do usuário e não certifica os serviços de produção.

O teste antigo tests/global-classification-identity.test.js, fora da suíte principal, usa uma extração de código desatualizada e falha com erro de sintaxe. Não foi alterado; os cenários de isolamento desta etapa possuem testes específicos novos.
