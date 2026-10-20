# Memória de tons dos vocalistas

## Regra aprovada

Somente o vínculo **Vocal/Vocalista no evento** ativa a adaptação. Marcar Vocal no perfil não transforma um guitarrista do evento em vocalista. Backing Vocal e demais funções não participam desta regra.

Para a mesma música, usa-se o tom oficial do evento passado mais recente do vocalista. Datas de hoje e futuras não contam como apresentações concluídas; não existe confirmação de término no modelo atual. A cronologia usa data e horário do evento no fuso America/Sao_Paulo, nunca o horário da última edição. Datas inválidas não são adivinhadas.

O histórico é reunido por conta do vocalista. O ID local de música não é global: para reconhecer a mesma composição entre playlists e líderes diferentes, título **e** artista devem coincidir após normalização exata de caixa, acentos e espaços. Não há correspondência aproximada de títulos. Sem identidade ou tom-fonte confiável, conserva-se a versão atual.

Uma divergência de modo maior/menor também conserva o tom atual: transpor a tônica não converte acordes maiores em menores, e o sistema não inventa uma reharmonização.

## Quando adapta

- Ao criar um evento com vocalista e repertório.
- Ao incluir/trocar a função de vocalistas no evento.
- Quando o vocalista aceita um convite por busca ou link; convite pendente não muda tons.
- Ao incluir uma música depois que o vocalista já está no evento.

Se houver vários vocalistas e seus históricos disponíveis concordarem, o ajuste é feito. Tons enarmônicos, como Db/C#, concordam. Se os históricos divergirem, mantém-se o tom atual, conforme a decisão expressa do usuário. Integrantes sem histórico não inventam um tom nem impedem o uso de um histórico conhecido.

Uma mudança manual do tom feita pelo líder fica protegida neste item do evento. Edições gerais do evento e entrada de outro vocalista não a desfazem. Retirar/reincluir a música como novo item permite uma nova adaptação. Não foi criado botão, modal ou escolha adicional de vocalista.

## Persistência e isolamento

`VocalKeyMemory` guarda a última ocorrência válida por vocalista/música, com chave, instante e referência de origem. A memória é preenchida pelo histórico existente e permanece quando o evento de origem é excluído posteriormente. Exclusões/edições anteriores à implantação, cujos dados já não existem, não podem ser recuperadas. A memória é atualizada nas mutações autorizadas; leituras GET não alteram repertórios.

As alterações atingem somente o tom oficial do item no evento de destino. `PersonalSong`, `SharedSong`, playlist e ajustes pessoais privados não são usados como histórico nem alterados. Nenhum endpoint expõe o repertório de outro evento ao novo líder.

`vocal_key_state` mantém o bloqueio manual e o tom-fonte do texto. O metadado opcional `shared.chordSheetKey` informa ao renderer em qual tom o resumo está escrito. Isso permite transpor resumo e Letra+Cifra, preservar as letras e evitar dupla transposição no editor, nos botões +/- e na repetição de uma gravação após conflito de versão. `songData` original continua intacto.

O ajuste automático gera uma mudança `KEY_CHANGED` no mecanismo já existente de auditoria, versionamento e preparação, sem criar nova interface. A aceitação continua concedendo apenas acesso de integrante, nunca liderança.

## Publicação e testes

Requer backend e frontend atualizados em conjunto. A inicialização existente cria a tabela de memória e adiciona a coluna JSON sem apagar dados. Nada foi publicado automaticamente. Quando a criação/edição é local ou offline, a adaptação ocorre ao sincronizar com o backend; não se presume acesso offline ao histórico global de outros usuários.

- `backend/tests/test_vocal_key_history.py`: histórico cronológico, função Vocal, conflitos, enarmonia, identificação entre contas, convites, novas músicas, bloqueio manual, permanência da memória e isolamento das bibliotecas.
- `tests/vocal-key-render.test.js`: transposição do resumo/Letra+Cifra, texto preservado, editor, versões pessoais, +/- e conflito de versão.
- `npm run test:vocal-keys`: validação de renderização; testes do backend usam banco isolado de memória.

Não houve decisão de design visual: a interface existente foi mantida. As mudanças de renderização apenas fazem a cifra refletir corretamente a regra musical solicitada.
