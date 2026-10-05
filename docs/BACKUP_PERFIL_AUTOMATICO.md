# Backup complementar automático do perfil

Formato de exportação v3: músicas completas e ajustes persistidos, nome/foto do perfil, favoritos, medley e preferências. Não contém eventos, credenciais, sessão ou caches de outras contas. Aceita também backups antigos v1/v2; eventos presentes nesses arquivos são ignorados.

Selecionar o arquivo JSON inicia a importação automaticamente, sem prévia ou seleção manual. Valida tamanho (25 MB), formato, músicas e identidade ativa antes de gravar. Bibliotecas inválidas são rejeitadas sem iniciar gravações.

- Música ausente: adiciona à identidade atual sem reaproveitar credenciais/versão de sincronização da conta original.
- Mesma identidade e conteúdo: ignora.
- Identidade coincidente, conteúdo diferente: preserva a atual e recupera o backup como cópia independente.
- Reimportar o mesmo arquivo não cria outra cópia idêntica.
- Músicas atuais ausentes no arquivo permanecem.
- Favoritos são unidos; blocos válidos de medley ausentes são acrescentados. Os blocos atuais não são removidos/reordenados.
- Nome/foto preenchem lacunas, sem substituir dados atuais; o nome padrão de visitante “Você” é considerado lacuna. Não importa e-mail, telefone, login ou identidade Google.
- Preferências importadas são limitadas a idioma, tema, cor, escala e opções de acessibilidade válidas, e somente preenchem chaves ainda não salvas. As escolhas atuais prevalecem.

Os dados complementares são gravados com cópias de retorno dos valores anteriores; em erro de gravação, tenta restaurá-los. A biblioteca ativa só é trocada após a gravação das músicas ser confirmada. Se o navegador não permitir nenhuma gravação, a importação é interrompida e informa erro; cópias externas de backup continuam recomendadas.

Limites: recursos pessoais recuperados permanecem vinculados à identidade atual. Eventos e catálogo comunitário não são alterados. Preferências globais continuam seguindo a arquitetura existente do app; não foi criada sincronização de perfil/medley no servidor nesta entrega.

Verificado por testes de biblioteca/segurança e interface: importação automática, versões diferentes como cópias, reimportação, dados atuais preservados, união de favoritos/medley, preenchimento de perfil/preferências, ausência de eventos e exportação. Implementação local, sem push/deploy.
